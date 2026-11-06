from abc import ABC, abstractmethod
from typing import List, Dict, Any
from app.models import DocContract, CodeEndpoint, DriftAlert

class BaseDriftRule(ABC):
    """
    Abstract interface for deterministic AST / contract drift rules.
    """
    rule_id: str
    name: str
    description: str

    @abstractmethod
    def evaluate(
        self,
        doc_contracts: List[DocContract],
        code_endpoints: List[CodeEndpoint]
    ) -> List[DriftAlert]:
        pass

class BaseDriftEvaluator(ABC):
    """
    Top-level evaluator interface implemented by AST rule sets
    and pluggable LLM semantic evaluators.
    """
    evaluator_id: str
    name: str

    @abstractmethod
    def run_evaluation(
        self,
        doc_contracts: List[DocContract],
        code_endpoints: List[CodeEndpoint],
        workspace_context: Dict[str, Any]
    ) -> List[DriftAlert]:
        pass
