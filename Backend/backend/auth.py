from fastapi import Security, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from typing import Dict, Any

# Frontend will send the Clerk JWT via Authorization: Bearer <token>
security = HTTPBearer(auto_error=False)

# This comes from your Clerk Dashboard -> API Keys -> Advanced -> "Issuer URL"
# E.g., https://clerk.your-domain.com
CLERK_ISSUER_URL = os.getenv("CLERK_ISSUER_URL")

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """
    Validates the Clerk JWT token.
    If CLERK_ISSUER_URL is not set in .env, it runs in 'mock' mode so the hackathon app doesn't break locally.
    """
    if not CLERK_ISSUER_URL:
        # Mock mode when no ENV is set
        return {"sub": "local_test_user", "mocked": True}
        
    if not credentials:
        raise HTTPException(
            status_code=401, 
            detail="Missing Authorization Bearer token."
        )
        
    token = credentials.credentials
    try:
        # Fetch the JSON Web Key Set (JWKS) from your Clerk instance
        jwks_client = jwt.PyJWKClient(f"{CLERK_ISSUER_URL}/.well-known/jwks.json")
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Decode and validate securely
        data = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False} # Change to True if you set up Audience in Clerk
        )
        return data
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
