from fastapi import FastAPI
from configs.supabase import supabase

app = FastAPI(title="Booking API")

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

