import asyncio
import base64
import json
import os
from traceback import print_exc

import replicate
from app.api.util import misc_bucket
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from loguru import logger


async def run_oemer_predictions(image_files):
    """
    Runs OEMER predictions asynchronously for all image files.

    Args:
        image_files: List of tuples containing image file information

    Returns:
        List of combined notes from all OEMER predictions
    """
    notes_oemer = []

    async with asyncio.TaskGroup() as tg:
        tasks = []
        for entry in image_files:
            with open(entry[0], "rb") as f:
                image_bytes = f.read()
            encoded_image = base64.b64encode(image_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(
                    replicate.async_run(
                        os.environ["OEMER_VERSION"], input={"image": encoded_image}
                    )
                )
            )

    # Gather results
    results = await asyncio.gather(*tasks)

    # Process results
    for result in results:
        if "notes" in result:
            notes_oemer.extend(result["notes"])

    if os.environ.get("DEBUG") == "True":
        with open("scores/last_oemer.json", "w") as f:
            json.dump(results, f)

    return notes_oemer


async def run_transkun_predictions(image_files, audio_files=None):
    """
    Runs TRANSKUN predictions asynchronously for all image and audio files.

    Args:
        image_files: List of tuples containing image file information
        audio_files: List of tuples containing audio file information

    Returns:
        List of outputs from all TRANSKUN predictions
    """
    if audio_files is None:
        audio_files = []

    async with asyncio.TaskGroup() as tg:
        tasks = []
        # Process image files
        for entry in image_files:
            with open(entry[0], "rb") as f:
                image_bytes = f.read()
            encoded_image = base64.b64encode(image_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(
                    replicate.async_run(
                        os.environ["TRANSKUN_VERSION"], input={"image": encoded_image}
                    )
                )
            )

        # Process audio files
        for entry in audio_files:
            with open(entry[0], "rb") as f:
                audio_bytes = f.read()
            encoded_audio = base64.b64encode(audio_bytes).decode("utf-8")
            tasks.append(
                tg.create_task(
                    replicate.async_run(
                        os.environ["TRANSKUN_VERSION"], input={"audio": encoded_audio}
                    )
                )
            )

    # Gather results
    results = await asyncio.gather(*tasks)

    if os.environ.get("DEBUG") == "True":
        with open("scores/last_transkun.json", "w") as f:
            json.dump(results, f)

    return results


async def process_models(score_files, audio_files, score_filename, storage, user):
    """
    Process both OEMER and TRANSKUN models concurrently.

    Both tasks are started at the same time. We wait for TRANSKUN to complete
    (waiting if necessary), then create/update the document with its results.
    Once both tasks have finished, we update the document with the OEMER results.
    """

    try:
        image_extensions = ["png", "jpg", "jpeg"]
        image_files = []

        # Filter image files
        for entry in score_files:
            ext = entry[3].rsplit(".", 1)[1].lower() if "." in entry[3] else ""
            if ext in image_extensions:
                image_files.append(entry)

        # If there are no image or audio files, exit early.
        if not image_files and not audio_files:
            return

        # Start both tasks concurrently.
        oemer_task = asyncio.create_task(run_oemer_predictions(image_files))
        transkun_task = asyncio.create_task(
            run_transkun_predictions(image_files, audio_files)
        )

        # Wait for TRANSKUN to complete first (if it hasn't already finished).
        notes_transkun = await transkun_task

        # Save TRANSKUN results as JSON and upload to storage.
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

        # Now wait for the OEMER task to complete concurrently.
        await oemer_task

    except Exception as ex:
        logger.info("Error processing models:", ex)
        print_exc()
