import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import speech from "@google-cloud/speech";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { VertexAI } from "@google-cloud/vertexai";
import serviceAccount from "./key.json" with { type: "json" };
import mainServiceAccount from "./key2.json" with { type: "json" };
import { google } from "googleapis";
import os from "os";
import path from "path";
import fs from "fs";
import dayjs from "dayjs";
import { TrackTemplates } from "./utils.js";

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "stt-notes-474506.firebasestorage.app",
});

const speechClient = new speech.SpeechClient();

const vertexAI = new VertexAI({
    project: "forestfoods",
    location: 'us-central1',
    googleAuthOptions: {
        keyFilename: "./sac2.json",
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
});

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function processTranscriptWithVertexAI({ transcript: rawTranscript, name, tracks, nextSessionPlans }) {
    try {
        const generativeModel = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.3,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 8192,
            },
        });
        const today = dayjs().format("DD/MM/YYYY");

        let template;
        let trackName;
        let formattedContent;

        if (tracks.length === 1) {
            trackName = tracks[0].trackName;
            template = TrackTemplates[trackName] || TrackTemplates['General'];
            
            const formattedObjectives = tracks[0].objectives
                .map((obj, i) => `${i + 1}. ${obj.trim()}`)
                .join('\n');

            console.log("formattedObjectives", formattedObjectives);
            
            formattedContent = formattedObjectives;
        } else {
            trackName = 'Clinical Notes';
            template = TrackTemplates['General'];
            
            const tracksAndObjectives = tracks.map((track, trackIndex) => {
                const objectivesForTrack = track.objectives
                    .map((obj, i) => `  ${i + 1}. ${obj.trim()}`)
                    .join('\n');
                
                return `Domain: ${track.trackName}\n${objectivesForTrack}`;
            }).join('\n\n');
            
            formattedContent = tracksAndObjectives;
        }
        console.log("nextSessionPlans", nextSessionPlans);

        const formattedTemplate = template
            .replace('{name}', name)
            .replace('{track}', trackName)
            .replace('{today}', today)
            .replace('{objectives}', formattedContent)
            .replace('{tracksAndObjectives}', formattedContent)
            .replace('{nextSessionPlans}', nextSessionPlans
                .split(/[\n,]+/)
                .map((o, i) => `${'-'} ${o.trim()}`)
                .join('\n'));;

        const prompt = `
            You are analyzing a speech therapy session transcript and producing professional clinical documentation.

            ## Your Tasks
            1. Format the raw transcript into a clear dialogue labeled as "Speech Therapist" and "Client".
            2. Identify who is speaking based on context.
            3. Analyze the transcript to determine: Whether the session was "Face-to-face" or "Online". Whether it was an "am session" or "pm session". Fill in Session Type as: "Face-to-face (am session)" or "Online (pm session)" format
            4. Generate clinical documentation using the structure provided in the template below. The template already contains pre-filled Session Objectives and Next Session plans. Do NOT regenerate them, they are provided by the therapist.
            5. Write from an **objective third-person professional perspective** — as if an observer is documenting what occurred during the session.
            6. Base EVERYTHING on actual events from the transcript - do not invent activities or outcomes.
            7. Keep the structure as shown but do NOT copy instructional text from the template.
            8. Return your final output **only** as valid JSON (no explanations or markdown).

            ---

            ### TEMPLATE
            ${formattedTemplate}
        
            ### RAW TRANSCRIPT:
            ${rawTranscript}

            ---

            ### RETURN FORMAT
            Return ONLY valid JSON in this format (no extra text or markdown):
            {
                "formattedConversation": "Speech Therapist: ...",
                "summary": "The completed Clinical Notes Template with domains correctly aligned to objectives."
            }
        `;

        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const text = response.candidates[0].content.parts[0].text;
        
        // Clean up the response (remove markdown code blocks if present)
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/g, '');
        }
        
        const parsedResult = JSON.parse(cleanedText);
        const summaryDoc = parsedResult.summary;
        const url = await createGoogleDoc(summaryDoc);
        console.log("url", url);
        return { parsedResult, url };
    } catch (error) {
        console.error('Error processing transcript with Vertex AI:', error);
        throw error;
    }
}

export const generateTranscript = onRequest({ memory: "512MiB" }, async(request, response) => {
    if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
    }

    const authHeader = request.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.*)$/);
    if (!match) {
        return response.status(401).json({ success: false, message: "Not authorized to access this route" });
    }

    const idToken = match[1];
    let decodedToken;

    try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
        return response.status(403).json({ success: false, message: "Not authorized to access this route" });
    }

    const { audioUrl, childId, sessionId, name, tracks, nextSessionPlans } = request.body;
    if (!audioUrl || !childId || !sessionId || !name || !tracks) {
        return response.status(400).json({ success: false, message: "Missing details in request body" });
    }

    try {

        const bucket = admin.storage().bucket();

        let filePath;

        if (audioUrl.includes('/o/')) {
            // Extract path after /o/
            const pathMatch = audioUrl.match(/\/o\/([^?]+)/);
            if (pathMatch) {
                filePath = decodeURIComponent(pathMatch[1]);
            }
        } else {
            throw new Error('Invalid Firebase Storage URL format');
        }

        // Create temporary file paths
        const tempDir = os.tmpdir();
        const inputFilePath = path.join(tempDir, `input_${Date.now()}.aac`);
        const outputFilePath = path.join(tempDir, `output_${Date.now()}.wav`);

        // Download file from Firebase Storage using Admin SDK
        await bucket.file(filePath).download({
            destination: inputFilePath,
        });

        // Convert audio to WAV format (16kHz, mono, 16-bit PCM)
        await convertAudioToWav(inputFilePath, outputFilePath);

        // Read the converted audio file
        const audioBytes = fs.readFileSync(outputFilePath);

        // Configure Speech-to-Text request
        const audio = {
            content: audioBytes.toString('base64'),
        };

        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
            model: 'default',
            useEnhanced: true,
        };

        const request = {
            audio: audio,
            config: config,
        };

        // Perform speech recognition
        const [response2] = await speechClient.recognize(request);

        // Extract transcript
        const transcript = response2.results.map((result) => result.alternatives[0].transcript).join('\n');

        const vertexResult = await processTranscriptWithVertexAI({ transcript, name, tracks, nextSessionPlans });
        
        // Clean up temporary files
        fs.unlinkSync(inputFilePath);
        fs.unlinkSync(outputFilePath);

        // Update session in Firestore if sessionId provided
        if (sessionId) {
            await admin.firestore().collection('sessions').doc(sessionId).update({
                transcript: transcript,
                formattedConversation: vertexResult?.parsedResult?.formattedConversation || "",
                summary: vertexResult?.parsedResult?.summary || "",
                url: vertexResult?.url || "",
                totalBilledTime: response2?.totalBilledTime || 0,
                // transcriptGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return response.status(200).json({
            success: true,
            transcript: transcript,
            formattedConversation: vertexResult?.parsedResult?.formattedConversation || "",
            url: vertexResult?.url || "",
            message: 'Transcript generated successfully',
        });
    } catch (error) {
        console.error('Error generating transcript:', error);

        // Return specific error messages
        if (error.code === 3) {
            return response.status(400).send("Audio file is too large or invalid format");
        }

        return response.status(400).send(`Failed to generate transcript: ${error.message}`);
    }
});

function convertAudioToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .audioBitrate('256k')
        .audioFilters('loudnorm')
        .on('start', (commandLine) => {
        })
        .on('progress', (progress) => {
        })
        .on('end', () => {
            resolve();
        })
        .on('error', (err) => {
            reject(err);
        })
        .save(outputPath);
    });
}

export async function createGoogleDoc(summaryText) {
    const folderId = '18W-BP-I-O8Wdykwp2tY9vWX5hMdJ1oWO';
    const auth = new google.auth.GoogleAuth({
        credentials: mainServiceAccount,
        scopes: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive"
        ],
    });
    
    const docs = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });

    try {
        const createRes = await drive.files.create({
            requestBody: {
                name: `Clinical Notes - ${new Date().toISOString()}`,
                mimeType: "application/vnd.google-apps.document",
                parents: [folderId]
            },
            fields: "id"
        });

        const docId = createRes.data.id;

        const insertTextRequest = [{
            insertText: {
                text: summaryText,
                location: { index: 1 }
            }
        }];
        await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
                requests: insertTextRequest
            }
        });

        const formattingRequests = [];

        const addBoldRequest = (startIndex, endIndex) => {
            formattingRequests.push({
                updateTextStyle: {
                    textStyle: {
                        bold: true
                    },
                    range: {
                        startIndex: startIndex,
                        endIndex: endIndex
                    },
                    fields: "bold"
                }
            });
        };

        const clinicalNotesIndex = summaryText.indexOf("Clinical Notes");
        if (clinicalNotesIndex !== -1) {
            addBoldRequest(clinicalNotesIndex + 1, clinicalNotesIndex + "Clinical Notes".length + 1);
        }

        const sIndex = summaryText.indexOf("S-");
        if (sIndex !== -1) {
            addBoldRequest(sIndex + 1, sIndex + "S-".length + 1);
        }

        const sessionObjectivesIndex = summaryText.indexOf("Session Objectives:");
        if (sessionObjectivesIndex !== -1) {
            addBoldRequest(sessionObjectivesIndex + 1, sessionObjectivesIndex + "Session Objectives:".length + 1);
        }

        const domainHeading = "Domain:";
        let currentSearchIndex = 0;
        while (true) {
            const domainIndex = summaryText.indexOf(domainHeading, currentSearchIndex);
            if (domainIndex === -1) {
                break;
            }
            addBoldRequest(domainIndex + 1, domainIndex + domainHeading.length + 1);
            currentSearchIndex = domainIndex + domainHeading.length;
        }

        const observationsIndex = summaryText.indexOf("Observations");
        if (observationsIndex !== -1) {
            addBoldRequest(observationsIndex + 1, observationsIndex + "Observations".length + 1);
        }

        const homePractiseIndex = summaryText.indexOf("Home Practise:");
        if (homePractiseIndex !== -1) {
            addBoldRequest(homePractiseIndex + 1, homePractiseIndex + "Home Practise:".length + 1);
        }

        const nextSessionIndex = summaryText.indexOf("Next Session:");
        if (nextSessionIndex !== -1) {
            addBoldRequest(nextSessionIndex + 1, nextSessionIndex + "Next Session:".length + 1);
        }

        const signedIndex = summaryText.indexOf("Signed:");
        if (signedIndex !== -1) {
            addBoldRequest(signedIndex + 1, signedIndex + "Signed:".length + 1);
        }

        if (formattingRequests.length > 0) {
            await docs.documents.batchUpdate({
                documentId: docId,
                requestBody: {
                    requests: formattingRequests
                }
            });
        }


        await drive.permissions.create({
            fileId: docId,
            requestBody: {
                role: "reader",
                type: "anyone"
            }
        });

        const shareLink = `https://docs.google.com/document/d/${docId}/edit`;
        console.log("Document created:", shareLink);
        
        return shareLink;
        
    } catch (error) {
        console.error("Error details:", error.message);
        if (error.errors) {
            console.error("API errors:", error.errors);
        }
        throw error;
    }
}
