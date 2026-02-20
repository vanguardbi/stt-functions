import { onRequest } from "firebase-functions/v2/https";
import { VertexAI } from "@google-cloud/vertexai";
import { google } from "googleapis";
import dayjs from "dayjs";
import { TrackTemplates } from "./utils.js";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { format, toZonedTime } from "date-fns-tz";

let supabase;
let mainServiceAccount;

const getSupabase = () => {
    if (!supabase) {
        supabase = createSupabaseClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
    }
};

const getMainServiceAccount = () => {
    if (!mainServiceAccount) {
        mainServiceAccount = JSON.parse(process.env.SHEETS_SERVICE_ACCOUNT);
    }
};

function toSnakeCase(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[^a-z0-9_]/g, '');    // Remove non-alphanumeric chars except underscore
}

// Helper: Parse dd/mm/yyyy to ISO String
function parseDateToIso(dateStr) {
    try {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.split("/");
        if (parts.length !== 3) return dateStr; // Fallback if not matching format
        const [day, month, year] = parts.map(Number);
        // Create UTC date at 00:00:00
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        return date.toISOString();
    } catch (e) {
        console.warn(`Failed to parse date: ${dateStr}, e`);
        return dateStr;
    }
}

// Helper: Parse dd/mm/yyyy hh:mm:ss to ISO String
function parseDateTimeToIso(dateTimeStr) {
    try {
        if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;
        const [datePart, timePart] = dateTimeStr.split(" ");
        if (!datePart || !timePart) return dateTimeStr; // Fallback

        const [day, month, year] = datePart.split("/").map(Number);
        const timeComponents = timePart.split(":").map(Number);
        const hours = timeComponents[0];
        const minutes = timeComponents[1];
        const seconds = timeComponents[2] || 0;

        const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        return date.toISOString();
    } catch (e) {
        console.warn(`Failed to parse datetime: ${dateTimeStr}, e`);
        return dateTimeStr;
    }
}

async function processTranscriptWithVertexAI({ VERTEX_CREDENTIALS_JSON, transcript: rawTranscript, name, tracks, nextSessionPlans, sessionNotes }) {
    try {
        const vertexAI = new VertexAI({
            project: "forestfoods",
            location: 'us-central1',
            googleAuthOptions: {
                // keyFilename: "./sac2.json",
                credentials: VERTEX_CREDENTIALS_JSON,
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            },
        });

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

        let formattedTemplate = template
            .replace('{name}', name)
            .replace('{track}', trackName)
            .replace('{today}', today)
            .replace('{objectives}', formattedContent)
            .replace('{tracksAndObjectives}', formattedContent)
            .replace('{nextSessionPlans}', nextSessionPlans
                .split(/[\n,]+/)
                .map((o, i) => `${'-'} ${o.trim()}`)
                .join('\n'));;

        if (sessionNotes && sessionNotes.trim() !== "") {
            const notesSection = `\nSession Notes:\n${sessionNotes}\n`;
            
            formattedTemplate = formattedTemplate.replace("Signed:", `${notesSection}\nSigned:`);
        }

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

export const generateTranscript = onRequest({ timeoutSeconds: 540, memory: '2GB', secrets: ["VERTEX_CREDENTIALS_JSON", "SHEETS_SERVICE_ACCOUNT", "SUPABASE_URL", "SUPABASE_ANON_KEY"] }, async(request, response) => {
    const VERTEX_CREDENTIALS_JSON = JSON.parse(process.env.VERTEX_CREDENTIALS_JSON);
    getSupabase();
    getMainServiceAccount();

    if (request.method !== "POST") {
        return response.status(405).json({ success: false, message: "Method not allowed" });
    }

    const authHeader = request.headers.authorization || "";

    const match = authHeader.match(/^Bearer (.*)$/);
    if (!match) {
        return response
        .status(401)
        .json({ success: false, message: "Not authorized to access this route" });
    }

    const accessToken = match[1];

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
    return response
        .status(403)
        .json({ success: false, message: "Not authorized to access this route" });
    }

    const { transcript, sessionId, name, tracks, nextSessionPlans, sessionNotes } = request.body;
    if (!transcript || !sessionId || !name || !tracks) {
        return response.status(400).json({ success: false, message: "Missing details in request body" });
    }

    try {

    const vertexResult = await processTranscriptWithVertexAI({ VERTEX_CREDENTIALS_JSON, transcript, name, tracks, nextSessionPlans, sessionNotes });

    if (sessionId) {
        const { error } = await supabase
            .from('sessions')
            .update({
                formatted_conversation: vertexResult?.parsedResult?.formattedConversation || "",
                summary: vertexResult?.parsedResult?.summary || "",
                doc_url: vertexResult?.url || "",
                generating_report: false,
            })
            .eq('id', sessionId);

        if (error) {
            console.error("Supabase Write Error:", error);
            throw new Error(error.message);
        }
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
        if (sessionId) {
            let errorMessage = "Unknown error";
                
            if (error instanceof Error) {
                // If it's a standard Error object (like new Error('...'))
                errorMessage = error?.message; 
            } else if (typeof error === 'object') {
                try {
                    errorMessage = JSON.stringify(error);
                } catch (e) {
                    errorMessage = "Unserializable object error";
                }
            } else {
                errorMessage = String(error);
            }

            try {
                await supabase.from('sessions').update({
                        generating_report: false,
                        generating_report_error: true,
                        report_error_message: errorMessage,
                    })
                    .eq('id', sessionId);
            } catch (dbUpdateError) {
                console.error("Failed to update error status in Supabase:", dbUpdateError);
            }
        }
        return response.status(400).json({
            success: false,
            error: "Error generating transcript",
            message: `Failed to generate transcript: ${error.message}`
        });
    }
});

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

export const saveCallLogs = onRequest({ cors: true, secrets: ["SUPABASE_URL", "SUPABASE_ANON_KEY"] }, async (request, response) => {
    getSupabase();

    if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
    }

    try {
        const { Sender, Date, Message, Type } = request.body;

        if (!Sender || !Date) {
            return response.status(400).json({ success: false, message: "Missing details in request body" });
        }

        const { data, error } = await supabase
        .from('communications') 
        .insert([
            { 
            "phone_number": Sender,
            "date": Date,
            "message": Message,
            "Type": Type,
            }
        ]);

        if (error) {
            console.error("Supabase Error:", error);
            return response.status(400).send(error);
        }

        response.status(200).send({ success: true });
    } catch (err) {
        console.error("System Error:", err);
        response.status(500).send("Internal Server Error");
    }
});

export const whatsappWebhook = onRequest({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN", "APPSHEET_APP_ID", "APPSHEET_ACCESS_KEY"] }, async (request, response) => {
    const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; 
    const APPSHEET_APP_ID = process.env.APPSHEET_APP_ID;
    const APPSHEET_ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;
    const TABLE_NAME = "WhatsApp";

    if (request.method === "GET") {
        const mode = request.query["hub.mode"];
        const token = request.query["hub.verify_token"];
        const challenge = request.query["hub.challenge"];

        if (mode === "subscribe" && token === WHATSAPP_ACCESS_TOKEN) {
            console.log("WhatsApp Webhook Verified!");
            return response.status(200).send(challenge);
        }
        return response.sendStatus(403);
    }

    if (request.method === "POST") {
        const data = request.body;

        try {
            if (data.entry && data.entry[0].changes && data.entry[0].changes[0].value.messages) {
            
                console.log("Changes:", JSON.stringify(data.entry[0].changes, null, 2));

                const messageObject = data.entry[0].changes[0].value.messages[0];
                const userMessage = messageObject.text.body;
                const senderNumber = data.entry[0].changes[0].value.metadata.phone_number_id;
                const recipientNumber = messageObject.from;

                console.log("recipientNumber (Customer):", recipientNumber);
                console.log("senderNumber:", senderNumber);
                console.log("userMessage", userMessage);

                let messageContent = "";
                const messageType = messageObject.type;
                if (messageType === "text") {
                    messageContent = messageObject.text.body;
                } else {
                    messageContent = `[${messageType} received]`;
                }

                const now = new Date();
                const timeZone = 'Africa/Nairobi';
                const nairobiDate = toZonedTime(now, timeZone);
                const dateStr = format(nairobiDate, 'yyyy-MM-dd', { timeZone });
                const timeStr = format(nairobiDate, 'HH:mm:ss', { timeZone });

                console.log(`Saving: ${recipientNumber} | ${dateStr} | ${timeStr}`);

                const apiUrl = `https://www.appsheet.com/api/v2/apps/${APPSHEET_APP_ID}/tables/${encodeURIComponent(TABLE_NAME)}/Action`;

                const appsheetResponse = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "applicationAccessKey": APPSHEET_ACCESS_KEY
                    },
                    body: JSON.stringify({
                        Action: "Add",
                        Properties: {
                            Locale: "en-US",
                            Timezone: "E. Africa Standard Time"
                        },
                        Rows: [{
                            "type": "text",
                            "phone_number": recipientNumber,
                            "date": dateStr,
                            "time": timeStr,
                            "content": messageContent,
                        }]
                    })
                });

                if (!appsheetResponse.ok) {
                    const errorText = await appsheetResponse.text();
                    console.log(`AppSheet API Error: ${errorText}`);
                }
                const responseText = await appsheetResponse.text();
                console.log("Raw Response Status:", appsheetResponse.status);
                console.log("Raw Response Body:", responseText);

                if (responseText) {
                    try {
                        const result = JSON.parse(responseText);
                        console.log("Parsed Result:", JSON.stringify(result, null, 2));
                    } catch (e) {
                        console.error("Failed to parse JSON. Raw body was:", responseText);
                    }
                } else {
                    console.warn("AppSheet returned an completely empty body.");
                }

                console.log("Message saved to AppSheet successfully.");

            }

            return response.status(200).send("EVENT_RECEIVED");
        } catch (error) {
            console.error("Error saving WhatsApp message:", error);
            return response.status(200).send("EVENT_RECEIVED");
        }
    }

    return response.sendStatus(405);
});

export const sendWhatsappMessage = onRequest({ cors: true, secrets: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"] }, async (request, response) => {

    const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; 

    const { recipientNumber, messageText, type, templateName, templateLanguage } = request.body;

    if (!recipientNumber || !type) {
        return response.status(400).json({
            success: false,
            error: "Missing required parameters"
        });
    }

    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    let payload = { };

    if (type === "text") {
        payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientNumber,
            type: "text",
            text: {
                preview_url: false,
                body: messageText
            }
        };
    }

    if (type === "template") {
        payload = {
            messaging_product: "whatsapp",
            to: recipientNumber,
            type: "template",
            template: { "name": templateName, "language": { "code": templateLanguage } },
        };
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const apiResponse = await res.json();

        console.log("WhatsApp Message Sent:", apiResponse);
        return response.status(200).send({ success: true, data: apiResponse?.data });

    } catch (error) {
        console.error("Error sending WhatsApp message:", error.response?.data || error.message);
        return response.status(500).send({ 
            success: false, 
            error: error.response?.data || "Failed to send message" 
        });
    }
});

export const syncToSupabase = onRequest({ cors: true, secrets: ["SUPABASE_URL", "SUPABASE_ANON_KEY"] }, async (request, response) => {
    getSupabase();

    if (request.method !== "POST") {
        return response.status(405).json({ success: false, message: "Method Not Allowed" });
    }

    try {
        const { UpdateMode, TableName, Data } = request.body;

        if (!UpdateMode || !TableName || !Data || !Data.ID) {
            console.log("Missing required fields: UpdateMode, TableName, or Data with ID");
            response.status(400).json({ success: false, message: "Missing required fields: UpdateMode, TableName, and Data with ID are required." });
            return;
        }

        let collectionName = toSnakeCase(TableName);

        // Handle table name mapping (AppSheet 'WhatsApp' -> Supabase 'messages')
        if (TableName === 'WhatsApp' || collectionName === 'whatsapp') {
            collectionName = 'messages';
        }

        console.log(`Target Table: ${collectionName}`);

        const documentId = Data.ID;

        // Process fields in Data
        const processedData = {};
        for (const [key, value] of Object.entries(Data)) {
            // Convert key to snake_case for column mapping
            const snakeKey = key;

            if (value === null || value === undefined) {
                processedData[snakeKey] = null;
                continue;
            }

            const keyLower = key.toLowerCase();

            // Number parsing for 'Volume'
            if (keyLower.includes("volume") && typeof value === 'string') {
                const numValue = parseFloat(value);
                processedData[snakeKey] = isNaN(numValue) ? 0 : numValue;
            }
            // Timestamp parsing
            else if (keyLower.includes("timestamp") && typeof value === 'string') {
                // Check for dd/mm/yyyy hh:mm:ss format
                if (value.includes("/") && value.includes(":")) {
                    processedData[snakeKey] = parseDateTimeToIso(value);
                } else {
                    // Fallback to standard Date parse if it's already ISO or other format
                    const date = new Date(value);
                    processedData[snakeKey] = !isNaN(date.getTime()) ? date.toISOString() : value;
                }
            }
            // Date parsing (avoid double-parsing if it contains timestamp)
            else if (keyLower.includes("date") && typeof value === 'string' && !keyLower.includes("timestamp")) {
                // Check for dd/mm/yyyy format
                if (value.includes("/")) {
                    processedData[snakeKey] = parseDateToIso(value);
                } else {
                    const date = new Date(value);
                    processedData[snakeKey] = !isNaN(date.getTime()) ? date.toISOString() : value;
                }
            }
            else {
                // Leave strings, numbers, booleans as is
                processedData[snakeKey] = value;
            }
        }

        if ('ID' in processedData) {
            processedData.id = processedData.ID;
            delete processedData.ID;
        }

        const updateModeLower = UpdateMode.toLowerCase();
        let resultMessage = "";

        // AppSheet 'Add' or 'Update'
        if (updateModeLower === "add" || updateModeLower === "update") {
            // Upsert handles both insert and update based on Primary Key.
            // We assume the Supabase table columns match the AppSheet keys (or are handled by Supabase's quoting).
            const { error } = await supabase
                .from(collectionName)
                .upsert(processedData);

            if (error) {
                console.error(`Error upserting to ${collectionName}:, error`);
                throw error;
            }
            
            resultMessage = `Document ${updateModeLower}d successfully in ${collectionName} with ID: ${documentId}`;

        } else if (updateModeLower === "delete") {
            
            const { error } = await supabase
                .from(collectionName)
                .delete()
                .eq('id', documentId); // Assumption: PK column is 'id' (snake_case)

            if (error) {
                console.error(`Error deleting from ${collectionName}:, error`);
                throw error;
            }
            resultMessage = `Document deleted successfully from ${collectionName} with ID: ${documentId}`;

        } else {
            return new Response("Invalid UpdateMode. Use 'Add', 'Update', or 'Delete'.", {
                status: 400,
                headers: corsHeaders
            });
        }

        console.log(resultMessage);

        response.status(200).json({ success: true });
    } catch (err) {
        console.error("System Error:", err);
        response.status(500).json({ success: false, message: "Internal Server Error" });
    }
});
