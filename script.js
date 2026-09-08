// ============================================================
// BIS SAHAYAK - FRONTEND SCRIPT
// ============================================================


// ============================================================
// ELEMENTS
// ============================================================

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const chatArea = document.querySelector(".chat-area");
const newChatButton = document.querySelector(".new-chat");
const menuItems = document.querySelectorAll(".menu-item");


// ============================================================
// CHAT STATE
// ============================================================

let currentChatId = Date.now().toString();

let currentMessages = [];

let chatHistory = [];


// ============================================================
// LOAD SAVED CHAT HISTORY
// ============================================================

try {

    chatHistory = JSON.parse(
        localStorage.getItem("BIS Sahayak ChatHistory") || "[]"
    );

    if (!Array.isArray(chatHistory)) {
        chatHistory = [];
    }

} catch (error) {

    console.error(
        "Could not load chat history:",
        error
    );

    chatHistory = [];
}


// ============================================================
// SAVE CURRENT CHAT
// ============================================================

function saveCurrentChat() {

    if (currentMessages.length === 0) {
        return;
    }


    const firstUserMessage =
        currentMessages.find(
            message => message.type === "user"
        );


    if (!firstUserMessage) {
        return;
    }


    const title =
        firstUserMessage.message
            .substring(0, 35);


    const existingChat =
        chatHistory.find(
            chat => chat.id === currentChatId
        );


    if (existingChat) {

        existingChat.messages =
            [...currentMessages];

        existingChat.title =
            title;

    } else {

        chatHistory.unshift({

            id: currentChatId,

            title: title,

            messages: [...currentMessages]

        });

    }


    try {

        localStorage.setItem(
            "BIS Sahayak ChatHistory",
            JSON.stringify(chatHistory)
        );

    } catch (error) {

        console.error(
            "Could not save chat history:",
            error
        );

    }


    renderChatHistory();
}


// ============================================================
// ADD MESSAGE TO CHAT
// ============================================================

// ============================================================
// MARKDOWN FORMATTER
// ============================================================

function formatMarkdown(text) {

    if (!text) {
        return "";
    }

    let formatted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bold
    formatted = formatted.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Headings
    formatted = formatted.replace(
        /^### (.*)$/gm,
        "<h4>$1</h4>"
    );

    formatted = formatted.replace(
        /^## (.*)$/gm,
        "<h3>$1</h3>"
    );

    formatted = formatted.replace(
        /^# (.*)$/gm,
        "<h2>$1</h2>"
    );

    // Bullet points
    formatted = formatted.replace(
        /^[•*-] (.*)$/gm,
        "<li>$1</li>"
    );

    // Numbered points
    formatted = formatted.replace(
        /^\d+\. (.*)$/gm,
        "<li>$1</li>"
    );

    // Line breaks
    formatted = formatted.replace(
        /\n/g,
        "<br>"
    );

    return formatted;
}


// ============================================================
// ADD MESSAGE TO CHAT
// ============================================================

function addMessage(
    message,
    type,
    save = true
) {

    const messageDiv =
        document.createElement("div");

    messageDiv.classList.add(
        "message",
        type
    );

    const displayMessage =
        type === "bot"
            ? formatMarkdown(message)
            : message;

    messageDiv.innerHTML = `

        <div class="message-icon">
            ${type === "user" ? "👤" : "G"}
        </div>

        <div class="message-content">
            ${displayMessage}
        </div>

    `;

    chatArea.appendChild(
        messageDiv
    );

    chatArea.scrollTop =
        chatArea.scrollHeight;

    if (save) {

        currentMessages.push({

            message: message,

            type: type

        });

        saveCurrentChat();
    }
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

    const question =
        messageInput.value.trim();


    if (question === "") {
        return;
    }


    // Remove welcome layout
    document
        .querySelector(".main")
        .classList.remove(
            "new-chat-active"
        );


    // Save the current question FIRST
    addMessage(
        question,
        "user"
    );


    // Clear input
    messageInput.value = "";


    // Disable send while waiting
    sendButton.disabled = true;

    sendButton.innerText = "Sending...";


    try {

        // ----------------------------------------------------
        // IMPORTANT:
        // currentMessages contains:
        //
        // {
        //     message: "...",
        //     type: "user" / "bot"
        // }
        //
        // Backend needs:
        //
        // {
        //     role: "user" / "assistant",
        //     content: "..."
        // }
        // ----------------------------------------------------

        const historyForBackend =
            currentMessages
                .slice(0, -1)
                .map(message => ({

                    role:
                        message.type === "user"
                            ? "user"
                            : "assistant",

                    content:
                        message.message

                }))
                .filter(
                    message =>
                        message.content &&
                        message.content.trim() !== ""
                );


        const result =
            await fetch(
                "/api/chat",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

    message: question,

    history:
        historyForBackend,

    language:
        document.getElementById("languageSelect")?.value || "English"
})

                }
            );


        // ----------------------------------------------------
        // Check backend response
        // ----------------------------------------------------

        if (!result.ok) {

            let errorText =
                "Backend error";

            try {

                const errorData =
                    await result.json();

                if (errorData.detail) {
                    errorText =
                        JSON.stringify(
                            errorData.detail
                        );
                }

            } catch (error) {

                // Ignore JSON parsing error

            }


            throw new Error(
                errorText
            );
        }


        const data =
            await result.json();


        // ----------------------------------------------------
        // Make sure reply exists
        // ----------------------------------------------------

        if (
            !data ||
            typeof data.answer !== "string"
        ) {

            throw new Error(
                "Invalid response from backend"
            );
        }


        // ----------------------------------------------------
        // Add AI answer
        // ----------------------------------------------------

        addMessage(
            data.answer,
            "bot"
        );


    } catch (error) {

        console.error(
            "BIS Sahayak error:",
            error
        );


        addMessage(

            "Sorry, I could not connect to the BIS Sahayak backend.",

            "bot"

        );

    } finally {

        sendButton.disabled = false;

        sendButton.innerText = "Send";

        messageInput.focus();

    }
}


// ============================================================
// SEND BUTTON
// ============================================================

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );

}


// ============================================================
// ENTER KEY
// ============================================================

if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        function(event) {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();

            }

        }
    );

}


// ============================================================
// WELCOME SCREEN
// ============================================================

function showWelcome() {

    document
        .querySelector(".main")
        .classList.add(
            "new-chat-active"
        );


    chatArea.innerHTML = `

        <div class="welcome">

            <div class="bot-icon">
                BIS
            </div>


            <h2>
                Hello! I'm BIS Sahayak 👋
            </h2>


            <p>
                Your intelligent assistant
                for BIS and Indian Standards.
            </p>


            <div class="suggestions">

                <button>
                    What is BIS?
                </button>


                <button>
                    Find an Indian Standard
                </button>


                <button>
                    Explain a BIS standard
                </button>


                <button>
                    Help me understand a standard
                </button>

            </div>

        </div>

    `;


    addSuggestionEvents();
}


// ============================================================
// SUGGESTION BUTTONS
// ============================================================

function addSuggestionEvents() {

    const suggestions =
        document.querySelectorAll(
            ".suggestions button"
        );


    suggestions.forEach(
        function(button) {

            button.addEventListener(
                "click",
                function() {

                    messageInput.value =
                        button.innerText;

                    sendMessage();

                }
            );

        }
    );
}


// ============================================================
// NEW CHAT
// ============================================================

if (newChatButton) {

    newChatButton.addEventListener(
        "click",
        function() {

            // Save previous chat first
            saveCurrentChat();


            // Create new chat ID
            currentChatId =
                Date.now().toString();


            // Empty current conversation
            currentMessages = [];


            // Show welcome screen
            showWelcome();


            // Focus input
            messageInput.focus();

        }
    );

}


// ============================================================
// SIDEBAR MENU
// ============================================================

menuItems.forEach(
    function(item) {

        item.addEventListener(
            "click",
            function() {

                menuItems.forEach(
                    function(menu) {

                        menu.classList.remove(
                            "active"
                        );

                    }
                );


                item.classList.add(
                    "active"
                );


                const page =
                    item.dataset.page;


                if (
                    page === "history"
                ) {

                    showChatHistoryPage();

                }

            }
        );

    }
);


// ============================================================
// RENDER CHAT HISTORY
// ============================================================

function renderChatHistory() {

    const historyContainer =
        document.getElementById(
            "chatHistoryList"
        );


    if (!historyContainer) {
        return;
    }


    historyContainer.innerHTML = "";


    chatHistory.forEach(
        function(chat) {

            const chatItem =
                document.createElement(
                    "div"
                );


            chatItem.className =
                "history-item";


            chatItem.innerText =
                chat.title;


            chatItem.addEventListener(
                "click",
                function() {

                    openChat(
                        chat.id
                    );

                }
            );


            historyContainer.appendChild(
                chatItem
            );

        }
    );
}


// ============================================================
// OPEN OLD CHAT
// ============================================================

function openChat(chatId) {

    const chat =
        chatHistory.find(
            chat => chat.id === chatId
        );


    if (!chat) {
        return;
    }


    currentChatId =
        chat.id;


    currentMessages =
        Array.isArray(chat.messages)
            ? [...chat.messages]
            : [];


    document
        .querySelector(".main")
        .classList.remove(
            "new-chat-active"
        );


    chatArea.innerHTML = "";


    currentMessages.forEach(
        function(message) {

            addMessage(

                message.message,

                message.type,

                false

            );

        }
    );


    messageInput.focus();
}


// ============================================================
// CHAT HISTORY PAGE
// ============================================================

function showChatHistoryPage() {

    chatArea.innerHTML = `

        <div class="page-content">

            <h2>
                💬 Chat History
            </h2>


            <p>
                Your previous BIS Sahayak conversations.
            </p>


            <div class="history-page-list">
            </div>

        </div>

    `;


    const list =
        document.querySelector(
            ".history-page-list"
        );


    if (chatHistory.length === 0) {

        list.innerHTML = `

            <div class="empty-state">
                No conversations yet.
            </div>

        `;

        return;
    }


    chatHistory.forEach(
        function(chat) {

            const item =
                document.createElement(
                    "button"
                );


            item.className =
                "history-page-item";


            item.innerText =
                "💬 " + chat.title;


            item.addEventListener(
                "click",
                function() {

                    openChat(
                        chat.id
                    );

                }
            );


            list.appendChild(
                item
            );

        }
    );
}


// ============================================================
// BIS STANDARD SEARCH BUTTON
// ============================================================

document.addEventListener(
    "click",
    function(event) {

        if (
            event.target.id ===
            "searchStandard"
        ) {

            const input =
                document.getElementById(
                    "standardSearch"
                );


            if (!input) {
                return;
            }


            const standard =
                input.value.trim();


            if (
                standard !== ""
            ) {

                searchBISStandard(
                    standard
                );

            }

        }

    }
);


// ============================================================
// BIS STANDARD SEARCH - ENTER
// ============================================================

document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Enter" &&
            event.target.id ===
            "standardSearch"
        ) {

            event.preventDefault();


            const standard =
                event.target.value.trim();


            if (
                standard !== ""
            ) {

                searchBISStandard(
                    standard
                );

            }

        }

    }
);


// ============================================================
// SEARCH BIS STANDARD
// ============================================================

async function searchBISStandard(
    standard
) {

    chatArea.innerHTML = `

        <div class="page-content">

            <h2>
                🔎 Searching BIS Standards...
            </h2>


            <p>
                Searching the connected BIS documents
                for <strong>${standard}</strong>
            </p>

        </div>

    `;


    try {

        const result =
            await fetch(
                "/api/chat",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        message:
                            `Find the BIS standard ${standard} in the connected documents. Give me its standard number, title, scope, and the most important requirements. If this standard is not present in the connected documents, clearly say that it was not found.`,

                        history: []

                    })

                }
            );


        if (!result.ok) {

            throw new Error(
                "Search failed"
            );

        }


        const data =
            await result.json();


        chatArea.innerHTML = `

            <div class="page-content">

                <h2>
                    🔎 BIS Standard Search
                </h2>


                <p>
                    Search results for:
                    <strong>
                        ${standard}
                    </strong>
                </p>


                <div class="standard-card">

                    <div class="standard-number">
                        ${standard.toUpperCase()}
                    </div>


                    <h3>
                        BIS Standard Information
                    </h3>


                    <p>
                        ${data.answer}
                    </p>

                </div>

            </div>

        `;


    } catch (error) {

        console.error(
            "BIS search error:",
            error
        );


        chatArea.innerHTML = `

            <div class="page-content">

                <h2>
                    🔎 BIS Standard Search
                </h2>


                <div class="empty-state">

                    Unable to search the
                    BIS knowledge base.

                </div>

            </div>

        `;

    }

}


// ============================================================
// STARTUP
// ============================================================

renderChatHistory();

showWelcome();