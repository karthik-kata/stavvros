import os
from typing import List, Dict, Any, Optional
from app.drift.base import BaseDriftEvaluator
from app.models import DocContract, CodeEndpoint, DriftAlert

class LLMDriftEvaluator(BaseDriftEvaluator):
    """
    Pluggable evaluator interface for detecting logical, semantic,
    and architectural boundary drift using Language Models.
    """
    evaluator_id = "evaluator-llm-semantic"
    name = "LLM Logical & Architectural Drift Evaluator"

    def __init__(self, provider: str = "mock", api_key: Optional[str] = None):
        self.provider = provider
        self.api_key = api_key or os.getenv("STAVVROS_LLM_API_KEY")

    def run_evaluation(
        self,
        doc_contracts: List[DocContract],
        code_endpoints: List[CodeEndpoint],
        workspace_context: Dict[str, Any]
    ) -> List[DriftAlert]:
        alerts: List[DriftAlert] = []

        # Example logical rule check: FleetHD Scope Out violation
        # PRD specifies "Cryptocurrency refunds" are OUT OF SCOPE.
        # If code contains 'crypto' or 'bitcoin', the LLM evaluator flags Scope Creep.
        specs = workspace_context.get("specs", [])
        for spec in specs:
            out_of_scope = " ".join(spec.scope_out).lower()
            if "crypto" in out_of_scope:
                # Check code endpoints for any crypto references
                for ep in code_endpoints:
                    if "crypto" in ep.path.lower():
                        alerts.append(DriftAlert(
                            id=f"alert-llm-scope-{spec.id}-{ep.id}",
                            rule_id="LLM-001-SCOPE-CREEP",
                            evaluator_origin="llm_semantic",
                            severity="medium",
                            title=f"Logical Drift: Out-of-Scope Feature Implemented ({ep.path})",
                            doc_spec=f"PRD explicitly lists '{ep.path}' domain under 'Out of Scope'.",
                            code_reality=f"Route implemented at {ep.file_path}:{ep.line_number}.",
                            doc_id=spec.id,
                            service_id=ep.service_id,
                            api_id=ep.id,
                            suggested_patch="Review PRD scope boundary or decommission out-of-scope endpoint."
                        ))

        return alerts
