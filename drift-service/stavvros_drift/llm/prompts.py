"""Prompt builders. Real models read `system` + `user`; the mock reads `inputs`."""
from __future__ import annotations

import json
from typing import Any

from .base import Prompt

SYSTEM_BASE = (
    "You are Stavvros, a tool that checks whether engineering documents still match the code. "
    "You are careful and literal. You never guess: if the evidence does not settle a question, say so. "
    "Answer with JSON only, matching the schema you are given."
)

VALUE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"enum": ["quantity", "bool", "header", "guard", "absence"]},
        "amount": {"type": "number"},
        "unit": {"type": "string"},
        "bound": {"enum": ["exact", "max", "min", "default"]},
        "value": {"type": "boolean"},
        "name": {"type": "string"},
    },
    "required": ["type"],
}

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "line": {"type": "integer"},
                    "subject": {"type": "string"},
                    "keywords": {"type": "array", "items": {"type": "string"}},
                    "value": VALUE_SCHEMA,
                    "quote": {"type": "string"},
                },
                "required": ["line", "subject", "keywords", "value", "quote"],
            },
        }
    },
    "required": ["claims"],
}

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"enum": ["match", "drift", "no_evidence"]},
        "evidence_fact_id": {"type": ["string", "null"]},
        "doc_value": {"type": "string"},
        "code_value": {"type": "string"},
        "reasoning": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["verdict", "evidence_fact_id", "doc_value", "code_value", "reasoning", "confidence"],
}

TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "severity": {"enum": ["critical", "high", "medium", "low"]},
        "reason": {"type": "string"},
    },
    "required": ["severity", "reason"],
}

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "impact": {"type": "string"}},
    "required": ["title", "impact"],
}

REWRITE_SCHEMA = {
    "type": "object",
    "properties": {"new_line": {"type": "string"}},
    "required": ["new_line"],
}


def _block(inputs: dict[str, Any]) -> str:
    return json.dumps(inputs, indent=2, default=str)


def extract_claims(doc_title: str, section: str, lines: list[tuple[int, str]]) -> Prompt:
    inputs = {"doc_title": doc_title, "section": section, "lines": [{"line": n, "text": t} for n, t in lines]}
    return Prompt(
        task="extract_claims",
        system=SYSTEM_BASE + (
            " Extract statements about how the software behaves that can be checked against source code: "
            "limits, time windows, rates, sizes, feature switches, required headers, permission rules, and "
            "statements that something never happens. Skip goals, metrics, plans and opinions. "
            "For each claim give the line number, a short subject, 3-6 lower-case keywords a programmer would "
            "use in identifiers for it (e.g. 'window', 'days', 'max', 'limit'), and the value with its unit."
        ),
        user=f"Document: {doc_title}\nSection: {section}\n\n" + "\n".join(f"{n}: {t}" for n, t in lines),
        schema=EXTRACT_SCHEMA,
        inputs=inputs,
    )


def judge_claim(claim: dict[str, Any], candidates: list[dict[str, Any]]) -> Prompt:
    inputs = {"claim": claim, "candidates": candidates}
    return Prompt(
        task="judge_claim",
        system=SYSTEM_BASE + (
            " Decide whether the code agrees with one documented claim. You get the claim and code facts "
            "found by static analysis (constants, route parameters, guard conditions, outbound calls). "
            "Pick the single fact that settles the claim. Convert units before comparing. "
            "Return 'match', 'drift', or 'no_evidence' when none of the facts is about this claim. "
            "Give both values in plain words (e.g. '30 days' and '14 days') and one or two sentences of reasoning."
        ),
        user="Claim:\n" + _block(claim) + "\n\nCode facts:\n" + _block(candidates),
        schema=JUDGE_SCHEMA,
        inputs=inputs,
    )


def triage_undocumented(route: dict[str, Any], policy_lines: list[str]) -> Prompt:
    inputs = {"route": route, "policy_lines": policy_lines}
    return Prompt(
        task="triage_undocumented",
        system=SYSTEM_BASE + (
            " A route exists in code but no document describes it. Rate how much that matters. "
            "Routes that grant elevated access, touch money, or that a policy says must be listed are high or "
            "critical. Internal helpers and routes only the owning team calls are low."
        ),
        user="Route:\n" + _block(route) + "\n\nRelevant policy text:\n" + "\n".join(policy_lines or ["(none)"]),
        schema=TRIAGE_SCHEMA,
        inputs=inputs,
    )


def summarize(finding: dict[str, Any]) -> Prompt:
    return Prompt(
        task="summarize_finding",
        system=SYSTEM_BASE + (
            " Write a title of at most 60 characters naming the subject and the change (e.g. "
            "'Refund window: 30 days → 14 days'), and one sentence of impact for the people who rely on the doc. "
            "Plain words, no jargon, no blame."
        ),
        user=_block(finding),
        schema=SUMMARY_SCHEMA,
        inputs={"finding": finding},
    )


def rewrite_line(line: str, doc_value: str, code_value: str, claim: dict[str, Any]) -> Prompt:
    inputs = {"line": line, "doc_value": doc_value, "code_value": code_value, "claim": claim}
    return Prompt(
        task="rewrite_doc_line",
        system=SYSTEM_BASE + (
            " Rewrite one line of a document so it matches the code. Change as little as possible and keep the "
            "author's style and markdown."
        ),
        user=_block(inputs),
        schema=REWRITE_SCHEMA,
        inputs=inputs,
    )
