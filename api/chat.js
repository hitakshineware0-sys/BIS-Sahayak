export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const response = await fetch(
            "https://bis-sahayak-ulk0.onrender.com/chat",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(req.body)
            }
        );

        const text = await response.text();

        console.log("Render status:", response.status);
        console.log("Render response:", text);

        return res.status(response.status).send(text);

    } catch (error) {
        console.error("Backend proxy error:", error);

        return res.status(500).json({
            error: "Proxy failed",
            details: String(error)
        });
    }
}