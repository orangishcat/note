import asyncio
import base64
import json
import os
from functools import lru_cache
from traceback import print_exc

from ..util import misc_bucket
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from beam import Client
from beam.client.client import Task
from loguru import logger


class BeamConfigError(RuntimeError):
    """Configuration error for Beam deployments."""


@lru_cache(maxsize=1)
def _get_beam_client() -> Client:
    token = os.environ.get("BEAM_TOKEN")
    if not token:
        raise BeamConfigError(
            "BEAM_TOKEN environment variable is required for Beam usage"
        )
    return Client(token=token)


def _get_deployment(env_key: str) -> str:
    deployment = os.environ.get(env_key)
    if not deployment:
        raise BeamConfigError(f"Missing required Beam deployment slug in {env_key}")
    return deployment


def _run_beam_task_sync(deployment: str, payload: dict):
    client = _get_beam_client()
    submission = client.submit(deployment, input=payload)
    if isinstance(submission, Task):
        return submission.result(wait=True)
    return submission


async def _run_beam_task(deployment: str, payload: dict):
    return await asyncio.to_thread(_run_beam_task_sync, deployment, payload)


async def run_oemer_predictions(image_files):
    """
    Runs OEMER predictions asynchronously for all image files.

    Args:
        image_files: List of tuples containing image file information

    Returns:
        List of combined notes from all OEMER predictions
    """
    notes_oemer = []
    if not image_files:
        return notes_oemer

    deployment = _get_deployment("OEMER_DEPLOYMENT")

    async with asyncio.TaskGroup() as tg:
        tasks = []
        for entry in image_files:
            with open(entry[0], "rb") as f:
                image_bytes = f.read()
            encoded_image = base64.b64encode(image_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(_run_beam_task(deployment, {"image": encoded_image}))
            )

    results = [task.result() for task in tasks]

    for result in results:
        if isinstance(result, dict) and "notes" in result:
            notes_oemer.extend(result["notes"])

    if os.environ.get("DEBUG") == "True":
        with open("scores/last_oemer.json", "w") as f:
            json.dump(results, f)

    return notes_oemer


async def run_transkun_predictions(image_files, audio_files=None):
    """
    Runs transkun predictions asynchronously for all image and audio files.

    Args:
        image_files: List of tuples containing image file information
        audio_files: List of tuples containing audio file information

    Returns:
        List of outputs from all transkun predictions
    """
    if audio_files is None:
        audio_files = []

    if not image_files and not audio_files:
        return []

    deployment = _get_deployment("TRANSKUN_DEPLOYMENT")

    async with asyncio.TaskGroup() as tg:
        tasks = []

        for entry in image_files:
            with open(entry[0], "rb") as f:
                image_bytes = f.read()
            encoded_image = base64.b64encode(image_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(_run_beam_task(deployment, {"image": encoded_image}))
            )

        for entry in audio_files:
            with open(entry[0], "rb") as f:
                audio_bytes = f.read()
            encoded_audio = base64.b64encode(audio_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(_run_beam_task(deployment, {"audio": encoded_audio}))
            )

    results = [task.result() for task in tasks]

    if os.environ.get("DEBUG") == "True":
        with open("scores/last_transkun.json", "w") as f:
            json.dump(results, f)

    return results


async def process_models(score_files, audio_files, score_filename, storage, user):
    """
    Process both OEMER and transkun models concurrently.

    Both tasks are started at the same time. We wait for transkun to complete
    (waiting if necessary), then create/update the document with its results.
    Once both tasks have finished, we update the document with the OEMER results.
    """

    try:
        image_extensions = ["png", "jpg", "jpeg"]
        image_files = []

        for entry in score_files:
            ext = entry[3].rsplit(".", 1)[1].lower() if "." in entry[3] else ""
            if ext in image_extensions:
                image_files.append(entry)

        if not image_files and not audio_files:
            return

        oemer_task = asyncio.create_task(run_oemer_predictions(image_files))
        transkun_task = asyncio.create_task(
            run_transkun_predictions(image_files, audio_files)
        )

        notes_transkun = await transkun_task

        base_name = os.path.splitext(score_filename)[0]
        transkun_json = json.dumps(notes_transkun)
        transkun_filename = f"{base_name}.pb"

        storage.create_file(
            bucket_id=misc_bucket,
            file_id="unique()",
            file=InputFile.from_bytes(
                transkun_json.encode("utf-8"), transkun_filename, "application/json"
            ),
            permissions=[
                Permission.read(user),
                Permission.write(user),
                Permission.delete(user),
            ],
        )

        await oemer_task

    except Exception as ex:
        logger.info("Error processing models:", ex)
        print_exc()
