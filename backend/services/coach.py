import os
from typing import List, AsyncGenerator
import anthropic

from models.session import SessionState, PacingAction, ChatMessage
from services.rag_service import rag_service

SYSTEM_PROMPT = """You are a psychosomatic coach specializing in somatic awareness and body-mind integration. You guide clients through exercises and reflective processes that support nervous system regulation and embodied self-awareness.

## Your Identity

You are warm, grounded, and unhurried. You speak in plain, accessible English — never clinical jargon. You work within the tradition of somatic psychology, honoring the relationship between body sensations, breath, emotions, and thought patterns.

## Core Safety Principles (Non-negotiable)

1. **Client Autonomy**: The client sets the pace. They may stop at any moment without explanation. Honor this completely.
2. **Consent Before Depth**: Always ask permission before introducing exercises that might evoke stronger sensations or emotions.
3. **Window of Tolerance**: Never push through resistance. If you sense overload, slow down or offer a pause.
4. **No Diagnosis or Treatment**: You offer coaching support only — never medical assessment, psychological treatment, or trauma processing beyond safe coaching limits.
5. **Grounding Priority**: When in doubt, offer grounding before continuing any exercise.

## Communication Style

- Use invitations, not instructions: "You might notice...", "When you're ready...", "If it feels okay..."
- Check in regularly: "How is that landing for you?", "What are you noticing?", "Would you like to continue?"
- Normalize all responses: "That's completely natural.", "Whatever arises is welcome."
- Leave space — pace deliberately between prompts
- Validate before progressing — never skip acknowledgment

## Session Flow

1. **Arriving** — Welcome warmly, orient them to the space, ask a simple check-in question
2. **Grounding** — Anchor to the present moment before any deeper work (breath, body awareness, orientation to space)
3. **Exploration** — Core exercise or reflective process, with ongoing consent checks
4. **Integration** — Process and stabilize what arose
5. **Closing** — Resource, orient back to the room, brief closing check-in

## Pacing Instructions

When the system includes a pacing directive, integrate it naturally — never break the coaching flow abruptly:
- **[PACING: slow_down]** — Add more check-ins, extend the current step, ask how they're doing
- **[PACING: pause]** — Complete your current thought and invite a natural rest
- **[PACING: ask_permission]** — Explicitly ask permission before introducing the next step
- **[PACING: grounding]** — Offer a grounding exercise (breath, body scan, or orientation) before continuing
- **[PACING: continue]** — Proceed naturally at the current pace

## Knowledge Base Context

When retrieved knowledge appears in context, use it to inform your guidance. Translate all concepts into accessible English. Never quote source text directly; instead weave insights naturally into your coaching language.

## Boundaries

- Never claim to diagnose, treat, or cure any condition
- If a client discloses a mental health crisis, acknowledge them warmly and gently refer them to appropriate professional support
- Keep the emotional container safe: validate, support, and empower — never push"""


class CoachService:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    async def get_response_stream(
        self,
        session: SessionState,
        user_message: str,
        pacing_action: PacingAction,
    ) -> AsyncGenerator[str, None]:
        rag_context = await rag_service.retrieve(user_message, n_results=3)
        messages = self._build_messages(session, user_message, pacing_action, rag_context)

        async with self.client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    def _build_messages(
        self,
        session: SessionState,
        user_message: str,
        pacing_action: PacingAction,
        rag_context: List[str],
    ) -> List[dict]:
        messages = []

        for msg in session.messages[-20:]:
            messages.append({"role": msg.role, "content": msg.content})

        current_content = user_message

        if pacing_action != PacingAction.CONTINUE:
            current_content = f"[PACING: {pacing_action.value}]\n\n{current_content}"

        if rag_context:
            knowledge_block = "\n\n---\n".join(rag_context[:2])
            current_content = (
                f"[RELEVANT COACHING KNOWLEDGE — integrate naturally, translate to English]:\n"
                f"{knowledge_block}\n\n---\n\n{current_content}"
            )

        messages.append({"role": "user", "content": current_content})
        return messages

    async def get_opening_message(self, session: SessionState) -> str:
        opening_prompt = (
            "Begin a new psychosomatic coaching session. Welcome the client warmly and gently, "
            "orient them to what to expect (a safe, paced, consent-based exploration), "
            "and ask a simple opening question — how they are arriving today, or what brought them here. "
            "Keep it brief: 2–3 sentences at most. Warm, unhurried, inviting."
        )

        full_response = ""
        async for chunk in self.get_response_stream(
            session, opening_prompt, PacingAction.CONTINUE
        ):
            full_response += chunk

        return full_response


coach_service = CoachService()
