export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const body = req.body || {};

        // Your frontend sends "message", not "question"
        const question = body.message || body.question;
        const history = body.history || [];
        const language = body.language || "English";

        if (!question) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const contents = [
            ...history.map(msg => ({
                role:
                    msg.role === "assistant"
                        ? "model"
                        : "user",
                parts: [
                    {
                        text: msg.content || ""
                    }
                ]
            })),
            {
                role: "user",
                parts: [
                    {
                        text: question
                    }
                ]
            }
        ];

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
            process.env.GEMINI_API_KEY,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [
                            {
                                text:
                                    `You are BIS Sahayak, an AI assistant for the Bureau of Indian Standards (BIS).

Help users understand Indian Standards, BIS certification, compliance, manufacturers, MSMEs and related BIS information.

Answer in ${language}.

Give clear, practical and easy-to-understand answers.

Do not invent BIS standard numbers, certifications or requirements.

If you are unsure, clearly say so.`
                            }
                        ]
                    },

                    contents: contents,

                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 1500
                    }
                })
            }
        );

        const data = await response.json();

        console.log(
            "Gemini status:",
            response.status
        );

        if (!response.ok) {
            console.error(
                "Gemini error:",
                data
            );

            return res.status(response.status).json({
                error:
                    data.error?.message ||
                    "Gemini request failed"
            });
        }

        const answer =
            data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("") ||
            "Sorry, I could not generate an answer.";

        return res.status(200).json({
            answer: answer
        });

    } catch (error) {
        console.error(
            "Vercel function error:",
            error
        );

        return res.status(500).json({
            error: String(error)
        });
    }
}