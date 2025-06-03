import os
import subprocess
import uuid
from tempfile import TemporaryDirectory

import fitz  # PyMuPDF
from loguru import logger


def pdf_preview(pdf_bytes, filename):
    """
    Uses PyMuPDF to extract the first page of a PDF (provided as byte content) as a PNG image.
    Returns a tuple of (image_bytes, generated_filename).
    """
    try:
        # Open the PDF from a byte stream
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc.load_page(0)  # load first page
        pix = page.get_pixmap(dpi=150)
        preview_bytes = pix.tobytes("png")
        preview_filename = f"{'.'.join(filename.split('.')[:-1])}-preview.png"
        return preview_bytes, preview_filename
    except Exception as e:
        logger.info(f"Error generating preview from PDF: {e}")
        return None, None


def score_preview(file_bytes, filename):
    """
    Generates a preview image from a score file provided as byte content.

    - For XML-based score files (mxl, musicxml, xml, mxmls): Writes the bytes to a temporary file,
      uses MuseScore (mscore) to render the file to a PDF, then uses PyMuPDF to extract the first page.
    - For PDF files: Directly uses PyMuPDF to extract the first page.
    - For image files: Uses the file bytes directly.

    Returns a tuple of (preview_bytes, preview_filename).
    """
    ext = filename.rsplit(".", 1)[1].lower() if "." in filename else ""

    if ext in ["mxl", "musicxml", "xml", "mxmls"]:
        # Write the XML-based score bytes to a temporary file for MuseScore processing.
        with TemporaryDirectory() as local_temp_dir:
            temp_input_path = os.path.join(local_temp_dir, filename)
            with open(temp_input_path, "wb") as f:
                f.write(file_bytes)
            # Render the score to PDF using MuseScore.
            pdf_tempfile = os.path.join(local_temp_dir, f"{uuid.uuid4().hex}.pdf")
            try:
                subprocess.run(
                    [
                        os.getenv("MSCORE_COMMAND", "mscore"),
                        temp_input_path,
                        "-o",
                        pdf_tempfile,
                    ],
                    check=True,
                )
            except Exception as e:
                logger.info("Error running MuseScore command:", e)
                return None, None
            # Read the generated PDF as bytes.
            try:
                with open(pdf_tempfile, "rb") as pf:
                    pdf_bytes = pf.read()
            except Exception as e:
                logger.info("Error reading generated PDF:", e)
                return None, None
            # Generate preview from the PDF bytes.
            preview_bytes, preview_filename = pdf_preview(pdf_bytes, filename)
            # Clean up the temporary PDF.
            if os.path.exists(pdf_tempfile):
                os.remove(pdf_tempfile)
    elif ext == "pdf":
        # For PDFs, directly generate the preview from the byte content.
        preview_bytes, preview_filename = pdf_preview(file_bytes, filename)
    elif ext in ["png", "jpg", "jpeg"]:
        # For images, simply use the provided bytes.
        preview_bytes = file_bytes
        preview_filename = filename
    else:
        raise Exception(f"Unsupported file type: {ext}")

    return preview_bytes, preview_filename


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    # Ensure output directory exists.
    output_dir = "preview-test"
    os.makedirs(output_dir, exist_ok=True)

    # Process each file type by reading its bytes first.
    for file_type in ["mxl", "pdf", "png"]:
        fp = f"liebestraum.{file_type}"
        logger.info("Current file:", fp, "\t\t", "Exists:", os.path.exists(fp))
        try:
            with open(fp, "rb") as f:
                file_bytes = f.read()
        except Exception as e:
            logger.error(f"Error reading {fp}: {e}")
            continue
        preview, preview_name = score_preview(file_bytes, fp)
        if preview:
            output_path = os.path.join(
                output_dir, f"liebestraum-{file_type}-preview.png"
            )
            with open(output_path, "wb") as out:
                out.write(preview)
            logger.info(
                f"Preview for {fp} saved as {output_path}. Preview name: {preview_name}"
            )
        else:
            logger.error(f"Failed to generate preview for {fp}")
