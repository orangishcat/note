import time
from functools import wraps

from loguru import logger


def timeit(label: str = ""):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = func(*args, **kwargs)
            duration = time.perf_counter() - start
            logger.opt(depth=1).info(
                f"\t[{label or func.__name__}] took {duration * 1000:.3f} ms"
            )
            return result

        return wrapper

    return decorator
