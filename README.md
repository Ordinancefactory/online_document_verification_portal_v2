# Online Document Verification Portal — Version 2

Applicant-facing portal for a private organisation. Applicants enter their details, record a video reading a one-time session code aloud, attach supporting documents, accept consent/declaration statements, and submit the evidence for later review.

## Included

- Applicant-only submission interface
- Private access-code gate configured by the organisation
- Camera/microphone preview and front/rear camera preference where supported
- Local video recording with preview before upload
- One-time six-digit code displayed for the applicant to read aloud
- Multiple PDF/JPG/JPEG/PNG/WebP document uploads (up to 10)
- Server-side validation, upload size limit, rate limiting, security headers
- Submission metadata and evidence stored in a private server directory
- Submission receipt/reference ID for the applicant

## Requirements

- Node.js 20 or newer
- HTTPS for production camera/microphone use
- A private server or organisation-managed hosting
- A strong portal access code

## Run locally

1. Extract this ZIP.
2. Open a terminal in the extracted project folder.
3. Copy `.env.example` to `.env`.
4. Replace `PORTAL_ACCESS_CODE` with a unique secret of at least 16 characters.
5. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

6. Open `http://localhost:3000` in Chrome or Edge.
7. Enter the configured portal access code. Allow camera and microphone permissions.

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env
```

Edit `.env` in a text editor before starting the server.

## Where submissions are stored

Each submission is saved in `data/submissions/<submission-id>/`:
- `submission.json` contains applicant metadata and stored file names.
- `verification-video-*.webm` (or another supported video extension) is the recording.
- `document-*.pdf`, `document-*.jpg`, etc. are uploaded documents.

The server does not expose a public endpoint to list or download submissions. An authorised organisation administrator must access the server's protected storage or add a properly authenticated reviewer workflow. Do not make `data/` publicly accessible.

## Important production security requirements

This project is a deployable starter implementation, not a complete audited identity-verification product. The shared access code is a basic organisational gate, not individual applicant authentication. Before handling real identity documents:

1. Put the app behind HTTPS/TLS; do not expose it over plain HTTP on a public network.
2. Prefer individual, expiring invitation tokens or authenticated accounts rather than a shared access code.
3. Configure the reverse proxy to limit request bodies and timeouts consistently with `MAX_UPLOAD_MB`.
4. Restrict server and backup access; encrypt storage and backups; use least-privilege operating-system permissions.
5. Add a secure reviewer dashboard with role-based access, audit logging, and no public file URLs.
6. Add malware scanning, file signature inspection, monitoring, backups, and tested deletion/retention policies.
7. Publish an organisation-specific privacy notice, legal basis/purpose, retention period, contact point, and consent wording.
8. Have the application and security configuration reviewed before production use.

## Notes and limitations

- Browser camera/microphone access normally requires HTTPS or localhost.
- Rear camera selection depends on the device and browser.
- The code is displayed in the applicant's browser and included in the submission metadata. The current version does not independently prove that the applicant read the code; a reviewer must compare the video with the submitted code.
- Files are stored on the server's local disk. For multiple server instances, use private object storage and a database.
- There is no officer/reviewer dashboard in this applicant-only build, per the requested scope.
- A process restart does not remove submissions; they remain in the configured data folder until an authorised administrator deletes them.
