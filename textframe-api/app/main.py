import json
import os
import secrets
from typing import Dict
from pocketbase import PocketBase, utils
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import JSONFormatter
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import nacl.signing
import nacl.encoding
import nacl.exceptions

app = FastAPI(docs_url=None, redoc_url=None)

dbUrl = os.environ["DB_URL"]
extensionId = os.environ["EXTENSION_ID"]
geminiApiKey = os.environ["GEMINI_API_KEY"]
geminiModelName = os.environ["GEMINI_MODEL_NAME"]
proxyUsername = os.environ["PROXY_USERNAME"]
proxyPassword = os.environ["PROXY_PASSWORD"]
proxyDomain = os.environ["PROXY_DOMAIN"]
proxyPort = os.environ["PROXY_PORT"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"chrome-extension://{extensionId}", "https://www.youtube.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH", "PUT"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

class Item(BaseModel):
    query: str
    video_id: str


httpsProxy = f"https://{proxyUsername}:{proxyPassword}@{proxyDomain}:{proxyPort}"
httpProxy = f"http://{proxyUsername}:{proxyPassword}@{proxyDomain}:{proxyPort}"  

db = PocketBase(dbUrl)
genai.configure(api_key=geminiApiKey)

generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 64,
    "max_output_tokens": 8192,
    "response_mime_type": "application/json",
}
model = genai.GenerativeModel(
    model_name=geminiModelName,
    generation_config=generation_config,
)

nonces: Dict[str, str] = {}

@app.post("/register_public_key")
async def register_public_key(request: Request):
    try:
        data = await request.json()
        uuid = data["uuid"]
        public_key_base64 = data["public_key"]

        try:
            existing_key = db.collection("public_keys").get_first_list_item(f'uuid="{uuid}"')
            if existing_key.public_key != public_key_base64:
                db.collection("public_keys").update(existing_key.id, {
                    "public_key": public_key_base64,
                })
        except utils.ClientResponseError as e:
            if e.status == 404:
                db.collection("public_keys").create({
                    "uuid": uuid,
                    "public_key": public_key_base64,
                })
             
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/get_nonce")
async def get_nonce(request: Request):
    uuid = request.headers.get("X-UUID")
    if not uuid:
        raise HTTPException(status_code=400, detail="X-UUID header missing")

    nonce = secrets.token_urlsafe(16)
    nonces[uuid] = nonce
    return {"nonce": nonce}

@app.post("/search")
async def search_video(request: Request, item: Item):
    uuid = request.headers.get("X-UUID")
    signature = request.headers.get("X-Nonce-Signature")

    if not uuid or not signature:
        raise HTTPException(status_code=400, detail="Missing authentication headers")
    
    result = db.collection("public_keys").get_first_list_item(f'uuid="{uuid}"')
    public_key_base64 = result.public_key

    if not public_key_base64:
        raise HTTPException(status_code=401, detail="User not registered")

    try:
        public_key = nacl.encoding.URLSafeBase64Encoder.decode(public_key_base64)
        verify_key = nacl.signing.VerifyKey(public_key)
        decoded_signature = nacl.encoding.URLSafeBase64Encoder.decode(signature)
        nonce = nonces.pop(uuid, None)

        if nonce is None:
            raise HTTPException(status_code=401, detail="Invalid nonce")
        
        verify_key.verify(nonce.encode(), decoded_signature)
    except (nacl.exceptions.BadSignatureError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    transcript = YouTubeTranscriptApi.get_transcript(item.video_id, proxies={
        'http': httpProxy,
        'https': httpsProxy
    })
    formatter = JSONFormatter()
    formattedTranscript = formatter.format_transcript(transcript)
    response = model.generate_content(prompt % (formattedTranscript, item.query))

    totalTokens = response.usage_metadata.total_token_count
    db.collection("meta_data").create({
        "uuid": uuid,
        "tokens": totalTokens,
        "response": response.text,
        "query": item.query
    })

    return json.loads(response.text)

prompt = '''
'''