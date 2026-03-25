# Backend Requirements for Agentic View

This document outlines the API endpoints and data structures required to support the new "Agentic View" in the frontend.

## Overview
The Agentic View allows users to input natural language queries combined with a file containing rsIDs (SNP identifiers). The backend needs to process these inputs to retrieve specific, clinically valuable information as requested by the user (e.g., "Minor Allele Frequency", "Clinical Significance").

## API Endpoints

### 1. Agentic Analysis Endpoint

**Endpoint:** `POST /api/agentic/analyze`

**Description:** Accepts a text query and a list of rsIDs (from an uploaded file), processes the request using an agentic workflow (likely involving LLMs and database lookups), and returns structured results.

**Request Format (Multipart/Form-Data):**
- `query` (Text): The user's natural language question (e.g., "What is the MAF for these variants?").
- `file` (File): A text-based file (txt, csv, vcf) containing a list of rsIDs.

**Response Format (JSON):**
```json
{
  "status": "success",
  "data": {
    "summary": "Found 5 variants matching the criteria. Here is the Minor Allele Frequency data.",
    "results": [
      {
        "rsid": "rs123456",
        "data": {
          "MAF": 0.05,
          "clinical_significance": "Pathogenic",
          "gene": "BRCA1",
          "description": "Variant found matching criteria..."
        }
      },
      {
        "rsid": "rs789012",
        "data": {
          "MAF": 0.01,
          "clinical_significance": "Benign",
          "gene": "TP53",
          "description": "Variant found matching criteria..."
        }
      }
    ],
    "missing_ids": ["rs000000"]
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "message": "Invalid file format or query processing failed."
}
```

## Functional Requirements
1. **File Parsing**: Backend must be able to extract rsIDs from standard biological file formats (simple text list, CSV, VCF).
2. **Contextual Intepretation**: The backend agent must interpret the `query` to determine *which* fields to look up in the dbNSFP/ClinVar databases.
3. **Data Retrieval**: Efficient lookup of attributes (MAF, scores, etc.) for the provided rsIDs.
4. **Response**: Return data in a structured format that the frontend can render generically (e.g., a table with dynamic columns based on the query).

## Notes for Backend Developer
- The frontend will not implement complex business logic. It expects the `results` array to contain key-value pairs that directly correspond to what the user asked for.
- Consider streaming the response if the agentic process takes a long time.
