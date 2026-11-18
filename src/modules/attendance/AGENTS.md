# Attendance architecture

- Card scans and phone scans share the attendance decision use case; employee row locks serialize method changes and revocation so one active method remains authoritative.
