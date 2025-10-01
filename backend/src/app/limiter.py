from flask_limiter import Limiter


def limit(limiter: Limiter):
    from api import api_bp

    limiter.limit("20 per minute")(api_bp)

    from api.scoring.audio import receive_audio, receive_notes

    limiter.limit("1 per 5 seconds")(receive_audio)
    limiter.limit("1 per 5 seconds")(receive_notes)
