from app.services.gemma_service import generate_text


prompt = """
You are helping an open-source project called
Temporal Intelligence Workspace.

Explain in two short sentences why preserving
project history is useful.
"""


result = generate_text(prompt)

print("\n========== GEMMA RESPONSE ==========\n")
print(result)
print("\n====================================\n")