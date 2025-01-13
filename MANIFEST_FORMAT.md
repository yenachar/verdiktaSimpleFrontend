# AI Jury Query Package Manifest Format

## Overview
Each archive of information (using 7z, zip, or tar+gzip) must contain a manifest file named `manifest.json`. This document describes the format and structure of this manifest file.

## Manifest Structure

### Key Components
1. **version** (required)
   - Starts at and defaults to "1.0"
   - Allows for future format upgrades

2. **primary** (required)
   - Describes the primary file using ONE of:
     - `filename`: Name of file located in the archive
     - `hash`: CID of externally hosted file

3. **additional** (optional)
   - List of additional files referenced in the primary document
   - Each file contains:
     - `name`: Unique identifier for the file
     - `type`: Format descriptor
     - Either `filename` or `hash`

4. **support** (optional)
   - List of hashes for supporting archives
   - Each entry contains:
     - `hash`: CID of supporting archive

5. **juryParameters** (required)
   - `NUMBER_OF_OUTCOMES`: Number of possible outcomes
   - `AI_NODES`: Array of AI jury members
     - Each node specifies:
       - `AI_MODEL`
       - `AI_PROVIDER`
       - `NO_COUNTS`
       - `WEIGHT`
   - `ITERATIONS`: Number of jury deliberation iterations

### Supported File Types
- Text: UTF8, UTF16
- Formatted: CSV, HTML
- Images: GIF, JPEG
- Audio: MP3, OGG
- Video: AV1, WEBM

## Primary File Format
The primary file must use the `QUERY` keyword to specify the AI evaluation query. References to supplemental data use the `REF:` prefix.

## Examples

### Example 1: True/False Image Verification 

Archive Contents:
- manifest.json
- primary.txt
- IMG_4872.JPG
- IMG_4873.JPG

manifest.json:
```json
{
  "version": "1.0",
  "primary": {
    "filename": "primary.txt"
  },
  "additional": [
    {
      "name": "imageOfWoman1",
      "type": "JPEG",
      "filename": "IMG_4872.JPG"
    },
    {
      "name": "imageOfWoman2",
      "type": "JPEG",
      "filename": "IMG_4873.JPG"
    }
  ],
  "juryParameters": {
    "NUMBER_OF_OUTCOMES": 2,
    "AI_NODES": [
      {
        "AI_MODEL": "GPT-4",
        "AI_PROVIDER": "OpenAI",
        "NO_COUNTS": 3,
        "WEIGHT": 1.0
      }
    ],
    "ITERATIONS": 1
  }
}
```

primary.txt:
```text
QUERY: The woman's dress in these images is red. True or False?
REF:imageOfWoman1
REF:imageOfWoman2
```

### Example 2: Data Analysis with External Support

Archive Contents:
- manifest.json
- primary.txt
- data.csv

manifest.json:
```json
{
  "version": "1.0",
  "primary": {
    "filename": "primary.txt"
  },
  "additional": [
    {
      "name": "dataset",
      "type": "CSV",
      "filename": "data.csv"
    }
  ],
  "support": [
    {
      "hash": "bafybeid7yg3zb76beig63l3x7lxn6kyxyf4gwczp6xkjnju6spj3k2ry6q"
    }
  ],
  "juryParameters": {
    "NUMBER_OF_OUTCOMES": 4,
    "AI_NODES": [
      {
        "AI_MODEL": "GPT-4",
        "AI_PROVIDER": "OpenAI",
        "NO_COUNTS": 2,
        "WEIGHT": 0.7
      },
      {
        "AI_MODEL": "BERT",
        "AI_PROVIDER": "Google",
        "NO_COUNTS": 2,
        "WEIGHT": 0.3
      }
    ],
    "ITERATIONS": 3
  }
}
```

primary.txt:
```text
QUERY: Based on the data provided, which factor most significantly impacts sales?
A) Price
B) Marketing Spend
C) Seasonality
D) Product Quality
REF:dataset
```

### Example 3: Audio Analysis with External Primary File

Archive Contents:
- manifest.json
- transcript.txt

manifest.json:
```json
{
  "version": "1.0",
  "primary": {
    "hash": "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"
  },
  "additional": [
    {
      "name": "transcript",
      "type": "UTF8",
      "filename": "transcript.txt"
    }
  ],
  "juryParameters": {
    "NUMBER_OF_OUTCOMES": 3,
    "AI_NODES": [
      {
        "AI_MODEL": "Whisper",
        "AI_PROVIDER": "OpenAI",
        "NO_COUNTS": 5,
        "WEIGHT": 0.8
      },
      {
        "AI_MODEL": "DeepSpeech",
        "AI_PROVIDER": "Mozilla",
        "NO_COUNTS": 2,
        "WEIGHT": 0.2
      }
    ],
    "ITERATIONS": 2
  }
}
```

transcript.txt:
```text
REF:audioFile

QUERY: Transcribe the provided audio file and determine the speaker's sentiment (Positive, Neutral, Negative).
```

## Implementation Notes

### File References
- Files can be included directly in the archive or referenced via CID hash
- The primary file must contain the query and any references to additional files
- References to additional files use the `REF:` prefix followed by the file's name as specified in the manifest
- External files are referenced using their IPFS CID hash

### Best Practices
- Use descriptive names for files in the `additional` section
- Include file type information to ensure proper handling
- Keep the primary query file clear and well-structured
- Use appropriate weights for AI jury members based on their reliability
- Consider the number of iterations based on the complexity of the query

### Version Control
- The manifest format supports future extensions through version control
- Always specify the version number to ensure compatibility
- Future versions may include additional fields or modify existing ones