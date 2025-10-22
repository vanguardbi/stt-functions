const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const {Storage} = require('@google-cloud/storage');
const serviceAccount = require("./key.json");
const os = require('os');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "stt-notes-474506.firebasestorage.app",
});

// Initialize Google Cloud Speech client
const speechClient = new speech.SpeechClient();

// Initialize Storage client
const storage = new Storage();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

exports.generateTranscript = onRequest(async(request, response) => {
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
        console.log("✅ Authenticated user:", decodedToken.uid);
    } catch (error) {
        console.error("❌ Token verification failed:", error);
        return response.status(403).json({ success: false, message: "Not authorized to access this route" });
    }

    const { audioUrl, childId, sessionId } = request.body;
    if (!audioUrl || !childId || !sessionId) {
        return response.status(400).send("Missing details in request body");
    }
    try {

        console.log('Processing audio:', audioUrl);

        const bucket = admin.storage().bucket();
        console.log("start", bucket.name)
        const [files] = await bucket.getFiles({ maxResults: 5 });
        console.log('Bucket is accessible:', files.map(f => f.name));

        // Extract file path from URL
        let filePath;
        const url = new URL(audioUrl);

        if (audioUrl.includes('/o/')) {
            // Extract path after /o/
            const pathMatch = audioUrl.match(/\/o\/([^?]+)/);
            if (pathMatch) {
                filePath = decodeURIComponent(pathMatch[1]);
            }
        } else {
            throw new Error('Invalid Firebase Storage URL format');
        }

        console.log('File path:', filePath);

        // Create temporary file paths
        const tempDir = os.tmpdir();
        const inputFilePath = path.join(tempDir, `input_${Date.now()}.aac`);
        const outputFilePath = path.join(tempDir, `output_${Date.now()}.wav`);

        // Download file from Firebase Storage using Admin SDK
        await bucket.file(filePath).download({
            destination: inputFilePath,
        });

        console.log('File downloaded to:', inputFilePath);

        // Convert audio to WAV format (16kHz, mono, 16-bit PCM)
        await convertAudioToWav(inputFilePath, outputFilePath);

        console.log('Audio converted to WAV:', outputFilePath);

        // Read the converted audio file
        const audioBytes = fs.readFileSync(outputFilePath);

        console.log('Audio bytes read, size:', audioBytes.length);

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
        console.log('Starting speech recognition...');
        const [response2] = await speechClient.recognize(request);
        console.log('Response2', response2);
        console.log('Transcript generated successfully', response2?.results[0]?.alternatives[0]);

        // Extract transcript
        const transcript = response2.results.map((result) => result.alternatives[0].transcript).join('\n');
        console.log("transcript", transcript)

        

        // Clean up temporary files
        fs.unlinkSync(inputFilePath);
        fs.unlinkSync(outputFilePath);

        console.log('Temporary files cleaned up');

        // Update session in Firestore if sessionId provided
        if (sessionId) {
            await admin.firestore().collection('sessions').doc(sessionId).update({
                transcript: transcript,
                // transcriptGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log('Session updated with transcript');
        }

        return response.status(200).json({
            success: true,
            transcript: transcript,
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
            console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
            console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', () => {
            console.log('Conversion finished successfully');
            resolve();
        })
        .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
        })
        .save(outputPath);
    });
}
