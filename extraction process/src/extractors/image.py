from PIL import Image, ImageOps
import pytesseract
from config.settings import TESSERACT_CMD, OCR_LANGUAGES

def extract(path):
    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    with Image.open(path) as im:
        image = ImageOps.exif_transpose(im).convert("RGB")
        text = pytesseract.image_to_string(image, lang=OCR_LANGUAGES)
        return {"method": "tesseract", "content": text,
                "width": image.width, "height": image.height, "format": im.format}
