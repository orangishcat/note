from flask_limiter import Limiter


def limit(limiter: Limiter):
    from api import api_bp

    # Apply general limits to all API routes
    limiter.limit("20 per minute")(api_bp)

    # Apply rate limit to the audio receive endpoint
    from api.scoring.audio import receive

    limiter.limit("1 per 5 seconds")(receive)
