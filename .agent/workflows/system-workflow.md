---
description: Comprehensive workflow of the Texperia 2026 Backend System
---

# Texperia 2026 Backend Workflow

This document outlines the core operational workflows of the Texperia 2026 backend system, covering payment processing, attendance marking, and lunch tracking.

## 1. Registration & Payment Workflow
This workflow is managed by the `paymentProcessor` and runs periodically to bridge the gap between registration forms and the event system.

```mermaid
graph TD
    A[Monitor Google Sheets] --> B{Payment APPROVED?}
    B -- Yes --> C{Token Assigned?}
    C -- No --> D[Generate Unique Attendance Token]
    D --> E[Generate QR Code & QR URL]
    E --> F[Generate Registration PDF Pass]
    F --> G[Update Google Sheet with Token & QR Link]
    G --> H[Send Confirmation Email with PDF Attachment]
    B -- No --> A
    C -- Yes --> A
```

### Key Steps:
1. **Detection**: The system scans CS and NCS sheets for approved registrations.
2. **Tokenization**: A unique 8-character ID is generated with a prefix (e.g., `CS--` or `NCS--`).
3. **Persistance**: Tokens are written to the sheet immediately to prevent duplicate processing.
4. **Communication**: The student receives their pass via email.

---

## 2. Attendance Scan Workflow
Triggered when an organizer scans a student's registration QR code.

```mermaid
graph TD
    A[Scanner POST /scan] --> B{Verify Secret & Token}
    B -- Valid --> C{Already Marked?}
    C -- No --> D[Mark Cache: Attendance = TRUE]
    D --> E[Update Google Sheet: Attendance = PRESENT]
    E --> F[Async Email: Send Attendance Confirmation]
    F --> G[Return Success to Scanner App]
    B -- Invalid --> H[Return Error: 403/400]
    C -- Yes --> I[Return Error: 409 Already Marked]
```

### Key Steps:
1. **Verification**: Checks the `TEX-2026-SECURE` secret and token validity.
2. **Concurrency**: Uses an in-memory cache for sub-millisecond status checks.
3. **Confirmation**: A simplified email is sent to the participant confirming their arrival.

---

## 3. Lunch Scan Workflow
Triggered at the food counter when a lunch token is scanned.

```mermaid
graph TD
    A[Scanner POST /lunch] --> B{Verify Lunch Token}
    B -- Valid --> C{Lunch Already Taken?}
    C -- No --> D[Mark Cache: Lunch = TRUE]
    D --> E[Update Google Sheet: Lunch = TAKEN]
    E --> F[Return Success to Scanner App]
    B -- Invalid --> G[Return Error]
    C -- Yes --> H[Return Error: Already Availed]
```

### Key Steps:
1. **Redirection**: If a lunch token is accidentally scanned at the attendance endpoint, the system automatically redirects it to the lunch handler.
2. **Exclusivity**: Ensures lunch can only be marked once per token.

---

## 4. Cache Management
To ensure high performance (responses under 1s), the system uses a warming mechanism.

- **Startup**: At server start, `warmUpCache()` fetches all tokens from all sheets.
- **Refresh**: Every 30 seconds (configured), the cache refreshes to include newly approved students.
- **Persistence**: A local `sheet_metadata_cache.json` tracks sheet tabs and headers to avoid repetitive discovery phase.
