# MFA encryption-key operations

`MFA_ENCRYPTION_KEY` protects stored authenticator secrets. Losing it makes
existing MFA enrollments unreadable. Exposing it allows an attacker with
database access to decrypt those enrollments.

## Generate and store the key

Generate exactly 32 random bytes encoded as base64:

```sh
openssl rand -base64 32
```

Store the resulting value in the production secret manager and inject it only
into the API runtime as `MFA_ENCRYPTION_KEY`. Do not put it in Git, a Vercel
client-visible variable, a Docker image, logs, tickets, or chat.

Maintain an access-controlled escrow copy in the organization’s recovery
vault. Back up the secret-manager configuration independently of the database,
record the owning team, and test that the recovery team can retrieve the
correct key without displaying it in routine logs.

## Keep it independent from JWT signing

`JWT_SECRET` may be rotated to invalidate access tokens. That rotation must
never change `MFA_ENCRYPTION_KEY`: existing encrypted MFA secrets must remain
decryptable after JWT rotation.

## Recovery procedure

1. Stop MFA enrollment changes while recovering configuration.
2. Restore the exact escrowed `MFA_ENCRYPTION_KEY` into the API secret manager.
3. Redeploy one non-public instance.
4. Verify an existing test administrator can complete MFA.
5. Restore normal capacity and record the recovery test date and result.

If the key is permanently lost, existing secrets cannot be decrypted. Revoke
privileged sessions, disable affected MFA enrollments through an audited
administrative procedure, verify account ownership, and require re-enrollment.

## Versioned rotation design

Do not replace the key in place. The current ciphertext prefix (`v1`) identifies
the encryption format but does not yet contain a key identifier. Before a real
rotation, implement and review this `v2` envelope:

```text
v2.<key-id>.<iv>.<authentication-tag>.<ciphertext>
```

The runtime keyring will contain one active encryption key and one or more
read-only legacy keys. New enrollments use the active key. Reads select the key
by `<key-id>`. A bounded migration decrypts each `v1` record with the old key,
re-encrypts it as `v2` with the active key, verifies it, and records progress
without logging plaintext. The old key may be removed only after:

- every MFA record has migrated;
- a database restore using the new keyring has been tested;
- rollback and emergency-access procedures have been exercised;
- the security owner approves retiring the escrowed legacy key.

Never attempt a rotation by changing `MFA_ENCRYPTION_KEY` on a live deployment.
