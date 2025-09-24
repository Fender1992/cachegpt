# DEPRECATED CLI (v10.0.8)

This is the **currently active** CLI version that is published to npm as `cachegpt-cli`.

## Status
- **Version**: 10.0.8
- **NPM Package**: cachegpt-cli
- **Status**: Active but deprecated
- **Migration Target**: /apps/cli (v2.0.0 with PKCE auth)

## Notes
- This CLI uses database polling for authentication
- The new CLI in /apps/cli uses OAuth PKCE flow
- DO NOT DELETE until migration is complete and users have upgraded

## Migration Plan
1. Publish new CLI as @cachegpt/cli v2.0.0
2. Add deprecation warning to this CLI
3. Support both for 90 days
4. Remove this version after user migration