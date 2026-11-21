# Project workflow

This project exercised the AI Program Management local-model pilot:

1. Read the empty repository and extract non-sensitive requirements into context.json.
2. Send only those requirements through LiteLLM's `pm-local` route to Ollama's
   installed `llama3.1:8b`. The requirements handoff is advisory, not a security gate.
3. Review the actual code and run encryption, storage, and browser tests directly.
4. Record coverage and limitations in VALIDATION.md. Do not use model assertions
   as proof of encryption, privacy, CI, review, or release readiness.

The model is not part of the inventory application and is not needed to start it.
Serial numbers, ownership records, receipts, passphrases, encryption keys, and
vault ciphertext must stay out of prompts and project evidence packets.

To repeat from the enclosing AI Program Management workspace, with its local
gateway running:

```sh
python3 workflow-gateway/gateway.py run handoff --snapshot Firearms/docs/context.json --output Firearms/docs/new-handoff.json
```

Select a new output filename. Refresh the capture time and evidence before reuse.
The repository cannot verify the model's identity from the alias alone; the local
gateway configuration maps `pm-local` to the stated installed model.

Automatic model summaries, shared retrieval, and provider-wide client changes
are not configured. The inventory app makes no model calls.
