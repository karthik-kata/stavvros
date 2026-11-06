---
title: Authentication security policy
kind: policy
owner: Sam
owner_role: Security lead
team: Identity
services: [auth]
---

# Authentication security policy

## Login
- Login attempts are limited to 5 per minute per account.
- Passwords must be at least 12 characters.
- Sessions expire after 30 minutes of inactivity.

## Password reset
- Password reset links are valid for 60 minutes.

## Endpoints
| Method | Path | Status | Response fields |
| --- | --- | --- | --- |
| POST | /auth/login | 200 | |
| POST | /auth/logout | 204 | |
| POST | /auth/password-reset | 202 | |

Any route that lets staff act as a customer must be listed in this policy and approved by Security.
