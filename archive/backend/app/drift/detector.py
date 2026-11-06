from typing import List, Dict, Any
from app.drift.base import BaseDriftRule, BaseDriftEvaluator
from app.drift.rules import (
    EndpointVersionDriftRule,
    SyncAsyncProtocolDriftRule,
    PhantomEndpointDriftRule,
    UndocumentedEndpointRule,
)
from app.drift.llm_evaluator import LLMDriftEvaluator
from app.models import DocContract, CodeEndpoint, DriftAlert

class DriftEngineOrchestrator:
    """
    Orchestrates deterministic AST rules and modular LLM evaluators
    to detect all structural, protocol, and logical code-doc drift.
    """

    def __init__(
        self,
        rules: List[BaseDriftRule] = None,
        evaluators: List[BaseDriftEvaluator] = None
    ):
        self.rules = rules or [
            EndpointVersionDriftRule(),
            SyncAsyncProtocolDriftRule(),
            PhantomEndpointDriftRule(),
            UndocumentedEndpointRule(),
        ]
        self.evaluators = evaluators or [
            LLMDriftEvaluator()
        ]

    def run_all(
        self,
        doc_contracts: List[DocContract],
        code_endpoints: List[CodeEndpoint],
        workspace_context: Dict[str, Any] = None
    ) -> List[DriftAlert]:
        context = workspace_context or {}
        all_alerts: List[DriftAlert] = []

        # 1. Run deterministic AST rules
        for rule in self.rules:
            alerts = rule.evaluate(doc_contracts, code_endpoints)
            all_alerts.extend(alerts)

        # 2. Run pluggable evaluators (LLM / Semantic)
        for evaluator in self.evaluators:
            alerts = evaluator.run_evaluation(doc_contracts, code_endpoints, context)
            all_alerts.extend(alerts)

        return all_alerts
