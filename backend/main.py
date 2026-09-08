import os
import re
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader
from google import genai
from google.genai import types


# =========================================================
# BASIC SETUP
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCUMENTS_FOLDER = os.path.join(BASE_DIR, "documents")

app = FastAPI(title="BIS Sahayak Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client()

MODEL_NAME = "gemini-3.5-flash-lite"
MAX_HISTORY_MESSAGES = 6
MAX_CONTEXT_PAGES = 2
MAX_CHARS_PER_PAGE = 3500
MAX_OUTPUT_TOKENS = 1500


# =========================================================
# DATA STORAGE
# =========================================================

bis_documents = {}


# =========================================================
# LOAD BIS PDFs
# =========================================================

def load_bis_documents():
    global bis_documents

    bis_documents = {}

    if not os.path.exists(DOCUMENTS_FOLDER):
        print("Documents folder not found:", DOCUMENTS_FOLDER)
        return

    pdf_files = [
        file_name
        for file_name in os.listdir(DOCUMENTS_FOLDER)
        if file_name.lower().endswith(".pdf")
    ]

    print(f"Found {len(pdf_files)} PDF files.")

    for file_name in sorted(pdf_files):
        file_path = os.path.join(DOCUMENTS_FOLDER, file_name)

        pages = []

        try:
            reader = PdfReader(file_path)

            for page_number, page in enumerate(reader.pages, start=1):

                try:
                    text = page.extract_text() or ""
                except Exception:
                    text = ""

                text = text.strip()

                if text:
                    pages.append(
                        {
                            "page": page_number,
                            "text": text,
                        }
                    )

            bis_documents[file_name] = pages

            print(
                f"Loaded: {file_name} "
                f"({len(pages)} pages)"
            )

        except Exception as error:
            print(
                f"Could not load {file_name}: {error}"
            )

    print(
        f"\nTotal documents loaded: "
        f"{len(bis_documents)}"
    )


# =========================================================
# STARTUP
# =========================================================

@app.on_event("startup")
def startup_event():

    print("\nLoading BIS documents...")

    load_bis_documents()

    print("BIS documents ready.\n")


# =========================================================
# REQUEST MODEL
# =========================================================

class Question(BaseModel):

    message: str

    history: list[dict] = Field(
        default_factory=list
    )

    language: str = "English"


# =========================================================
# FIND STANDARD NUMBER
# =========================================================

def find_standard_number(text: str):

    if not text:
        return None

    match = re.search(
        r"\bis[\s-]*(\d{3,6})\b",
        text,
        re.IGNORECASE,
    )

    if match:
        return match.group(1)

    return None


# =========================================================
# FIND STANDARD FROM PREVIOUS USER MESSAGES
# =========================================================

def find_context_standard(history):

    if not history:
        return None

    for message in reversed(history):

        if not isinstance(message, dict):
            continue

        role = message.get("role", "")
        content = message.get("content", "")

        if role != "user":
            continue

        standard_number = find_standard_number(content)

        if standard_number:
            return standard_number

    return None


# =========================================================
# CLEAN TEXT
# =========================================================

def clean_text(text: str):

    if not text:
        return ""

    text = re.sub(r"\s+", " ", text)

    return text.strip()


# =========================================================
# SEARCH BIS DOCUMENTS
# =========================================================

def search_documents(query: str, history=None):

    query = query or ""

    # First look for a standard in the current question.
    standard_number = find_standard_number(query)

    # If current question doesn't contain one,
    # look at previous user messages.
    if not standard_number:
        standard_number = find_context_standard(history)

    query_words = set(
        re.findall(
            r"[a-zA-Z0-9]+",
            query.lower()
        )
    )

    results = []

    for file_name, pages in bis_documents.items():

        # -------------------------------------------------
        # If we know the standard number, strongly prefer
        # that standard's PDF.
        # -------------------------------------------------

        file_name_lower = file_name.lower()

        standard_match = False

        if standard_number:

            if re.search(
                rf"(?<!\d){re.escape(standard_number)}(?!\d)",
                file_name_lower,
            ):
                standard_match = True

        for page_data in pages:

            page_number = page_data["page"]
            original_text = page_data["text"]

            text = clean_text(original_text)

            if not text:
                continue

            text_lower = text.lower()

            score = 0

            # -------------------------------------------------
            # Standard number match
            # -------------------------------------------------

            if standard_number:

                if standard_number in file_name_lower:
                    score += 100

                if re.search(
                    rf"\bis[\s-]*{re.escape(standard_number)}\b",
                    text_lower,
                    re.IGNORECASE,
                ):
                    score += 80

                if standard_match:
                    score += 40

            # -------------------------------------------------
            # Keyword matching
            # -------------------------------------------------

            for word in query_words:

                if len(word) < 3:
                    continue

                if word in text_lower:
                    score += 2

            # -------------------------------------------------
            # Useful generic terms
            # -------------------------------------------------

            important_words = [
                "requirement",
                "requirements",
                "scope",
                "cover",
                "covers",
                "purpose",
                "material",
                "materials",
                "design",
                "testing",
                "test",
                "specification",
                "shall",
                "construction",
            ]

            for word in important_words:

                if word in query.lower() and word in text_lower:
                    score += 4

            if score > 0:

                results.append(
                    {
                        "score": score,
                        "file": file_name,
                        "page": page_number,
                        "text": text,
                    }
                )

    # Highest relevance first.
    results.sort(
        key=lambda item: item["score"],
        reverse=True
    )

    # ---------------------------------------------------------
    # Keep ONLY a tiny amount of context.
    # ---------------------------------------------------------

    selected = results[:MAX_CONTEXT_PAGES]

    final_results = []

    for item in selected:

        text = item["text"]

        if len(text) > MAX_CHARS_PER_PAGE:
            text = text[:MAX_CHARS_PER_PAGE] + "..."

        final_results.append(
            {
                "file": item["file"],
                "page": item["page"],
                "text": text,
            }
        )

    return final_results


# =========================================================
# CREATE BIS CONTEXT
# =========================================================

def build_bis_context(results):

    if not results:
        return "No relevant BIS document content was found."

    parts = []

    for item in results:

        parts.append(
            f"""
SOURCE: {item['file']}
PAGE: {item['page']}

{item['text']}
""".strip()
        )

    return "\n\n---\n\n".join(parts)


# =========================================================
# CHAT
# =========================================================

@app.post("/chat")
async def chat(question: Question):

    user_question = question.message.strip()

    if not user_question:

        return {
            "answer": "Please enter a question."
        }

    # -----------------------------------------------------
    # Retrieve only relevant BIS pages.
    # -----------------------------------------------------

    relevant_documents = search_documents(
        user_question,
        question.history
    )

    bis_context = build_bis_context(
        relevant_documents
    )

    # -----------------------------------------------------
    # Keep only the last few conversation messages.
    # -----------------------------------------------------

    clean_history = []

    for message in question.history[-MAX_HISTORY_MESSAGES:]:

        if not isinstance(message, dict):
            continue

        role = message.get("role")
        content = message.get("content")

        if role not in ["user", "assistant"]:
            continue

        if not content:
            continue

        content = str(content).strip()

        if not content:
            continue

        # Prevent old huge answers from being resent.
        if len(content) > 2500:
            content = content[:2500] + "..."

        clean_history.append(
            {
                "role": role,
                "content": content,
            }
        )

    # -----------------------------------------------------
    # Build model conversation.
    # -----------------------------------------------------

    conversation = []

    for message in clean_history:
        conversation.append(message)

    conversation.append(
        {
            "role": "user",
            "content": (
                f"""
BIS DOCUMENT CONTEXT:

{bis_context}

---

USER QUESTION:

{user_question}
"""
            ).strip(),
        }
    )

    # -----------------------------------------------------
    # GEMINI INSTRUCTIONS
    # -----------------------------------------------------

    instructions = """
You are BIS Sahayak, an AI assistant for Bureau of Indian Standards (BIS) and Indian Standards.

Your job is to answer questions about BIS standards using the supplied BIS document context.

RULES:

1. Use the supplied BIS document context whenever it is relevant.

2. Maintain conversation context.
   If the user says things like:
   "it", "its", "this standard", "that standard",
   understand the reference from the previous conversation.

3. Do NOT randomly ask the user which standard they mean if the previous conversation clearly identifies the standard.

4. Do NOT invent clauses, requirements, numbers, page references, or technical specifications.

5. If the supplied documents do not contain enough information to answer something confidently, say so clearly.

6. Keep answers concise but useful.

7. When possible, mention the relevant BIS standard number and document/page.

8. If multiple BIS standards appear in the context, distinguish them clearly.

9. Do not claim that something is a BIS requirement unless the supplied BIS material supports it.

10. Answer naturally, like a helpful BIS standards assistant.
""".strip()

    # -----------------------------------------------------
    # LANGUAGE SUPPORT
    # -----------------------------------------------------

    selected_language = question.language or "English"

    supported_languages = [
        "English",
        "Hindi",
        "Marathi",
        "Bengali",
        "Gujarati",
        "Tamil",
        "Telugu",
        "Kannada",
        "Malayalam",
        "Punjabi",
    ]

    if selected_language not in supported_languages:
        selected_language = "English"

    instructions += f"""

LANGUAGE RULE:

Answer the user's question in {selected_language}.

Use natural, clear language appropriate for the selected language.

Keep BIS standard numbers, clause numbers, technical terms,
and standard names unchanged where appropriate.

Do not translate standard numbers such as IS 456:2000.

If a technical BIS term is normally used in English,
you may keep the technical term in English while explaining
the meaning in the selected language.
""".strip()

    # -----------------------------------------------------
    # CALL GEMINI
    # -----------------------------------------------------

    try:
        # Convert the existing conversation history into one
        # compact text prompt.

        conversation_text = ""

        for message in clean_history:
            role = message.get("role", "")
            content = message.get("content", "")

            if role == "user":
                conversation_text += (
                    f"USER:\n{content}\n\n"
                )

            elif role == "assistant":
                conversation_text += (
                    f"ASSISTANT:\n{content}\n\n"
                )

        conversation_text += (
            "CURRENT USER QUESTION WITH BIS DOCUMENT CONTEXT:\n"
            + conversation[-1]["content"]
        )

        response = None

        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=MODEL_NAME,
                    contents=conversation_text,
                    config=types.GenerateContentConfig(
                        system_instruction=instructions,
                        max_output_tokens=MAX_OUTPUT_TOKENS,
                    ),
                )
                break

            except Exception as error:
                error_text = str(error)

                if (
                    ("503" in error_text or "UNAVAILABLE" in error_text)
                    and attempt < 2
                ):
                    wait_time = 2 ** attempt

                    print(
                        f"Gemini temporarily unavailable. "
                        f"Retrying in {wait_time} seconds..."
                    )

                    time.sleep(wait_time)

                else:
                    raise

        answer = response.text if response else ""

        if not answer:
            answer = (
                "I could not generate an answer "
                "from the available BIS documents."
            )

        return {
            "answer": answer,
            "sources": [
                {
                    "file": item["file"],
                    "page": item["page"],
                }
                for item in relevant_documents
            ],
        }

    except Exception as error:
        print("\nGEMINI ERROR:")
        print(error)
        print()

        return {
            "answer": (
                "I could not generate the answer right now. "
                "Please try again in a moment."
            )
        }



# =========================================================
# GET AVAILABLE STANDARDS
# =========================================================

@app.get("/standards")
def get_standards():

    standards = sorted(
        bis_documents.keys()
    )

    return {

        "documents": standards,

        "count": len(standards),
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/")
def root():

    return {

        "message": "BIS Sahayak Backend is running!",

        "documents_loaded": len(bis_documents),
    }