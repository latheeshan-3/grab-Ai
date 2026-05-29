from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from configs.supabase import supabase
from routers.chat import router as chat_router

app = FastAPI(title="Booking API")

# ---------------------------------------------------------------------------
# CORS — allow the grab-ui frontend to call this API
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(chat_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Booking API"}


@app.get("/test-supabase")
def test_supabase():
    try:
        # Return success if client initialization is verified
        return {
            "status": "configured",
            "supabase_url": supabase.supabase_url
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

