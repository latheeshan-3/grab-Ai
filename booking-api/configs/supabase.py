import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL must be set in environment variables")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY must be set in environment variables")

# Client using the anon key (standard user operations)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Client using the service role key (admin/bypass RLS operations)
supabase_admin: Client = None
if SUPABASE_SERVICE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_supabase_client() -> Client:
    return supabase