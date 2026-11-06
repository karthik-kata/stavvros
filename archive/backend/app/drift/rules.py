from typing import List
from app.drift.base import BaseDriftRule
from app.models import DocContract, CodeEndpoint, DriftAlert

class EndpointVersionDriftRule(BaseDriftRule):
    """
    Detects when an endpoint specified in a PRD/doc has migrated to a new version in code
    (e.g., Doc specifies POST /v1/refunds, but code implements POST /v2/refunds/async).
    """
    rule_id = "DRIFT-001-VERSION"
    name = "Endpoint Version & Path Migration"
    description = "Flags when an API route specified in documentation is deprecated or replaced by a newer version in code."

    def evaluate(self, doc_contracts: List[DocContract], code_endpoints: List[CodeEndpoint]) -> List[DriftAlert]:
        alerts = []
        code_by_service = {}
        for ep in code_endpoints:
            code_by_service.setdefault(ep.service_id, []).append(ep)

        for doc in doc_contracts:
            service_eps = code_by_service.get(doc.service_id, [])
            # Exact match check
            exact_match = any(ep.path == doc.path and ep.method == doc.method for ep in service_eps)
            if not exact_match:
                # Prioritize matching by domain tag first (e.g. 'refund' in '/v2/refunds/async')
                domain_matches = [ep for ep in service_eps if doc.domain_tag in ep.path.lower()]
                siblings = domain_matches if domain_matches else [ep for ep in service_eps if ep.method == doc.method]
                
                if siblings:
                    closest = siblings[0]
                    alerts.append(DriftAlert(
                        id=f"alert-ver-{doc.id}-{closest.id}",
                        rule_id=self.rule_id,
                        evaluator_origin="ast_rule",
                        severity="critical",
                        title=f"Endpoint Version Drift: {doc.path} ➔ {closest.path}",
                        doc_spec=f"Doc line {doc.line_number}: specifies '{doc.method} {doc.path}'",
                        code_reality=f"Code {closest.file_path}:{closest.line_number}: implements '{closest.method} {closest.path}' (status: {closest.status_code})",
                        doc_id=doc.doc_id,
                        service_id=closest.service_id,
                        api_id=closest.id,
                        suggested_patch=f"Update {doc.doc_path} (line {doc.line_number}) to reference '{closest.method} {closest.path}'"
                    ))
        return alerts

class SyncAsyncProtocolDriftRule(BaseDriftRule):
    """
    Detects architectural/protocol drift: doc states synchronous REST response,
    but code implements an asynchronous background worker or Kafka event stream.
    """
    rule_id = "DRIFT-002-PROTOCOL"
    name = "Synchronous vs Asynchronous Protocol Drift"
    description = "Flags when documentation promises a synchronous REST contract but code executes asynchronously via background event bus."

    def evaluate(self, doc_contracts: List[DocContract], code_endpoints: List[CodeEndpoint]) -> List[DriftAlert]:
        alerts = []
        code_by_path = {(ep.method, ep.path): ep for ep in code_endpoints}

        for doc in doc_contracts:
            key = (doc.method, doc.path)
            if key in code_by_path:
                code_ep = code_by_path[key]
                if doc.is_sync and code_ep.is_async:
                    alerts.append(DriftAlert(
                        id=f"alert-proto-{doc.id}-{code_ep.id}",
                        rule_id=self.rule_id,
                        evaluator_origin="ast_rule",
                        severity="medium",
                        title=f"Protocol Drift on {doc.path}",
                        doc_spec=f"Doc specifies synchronous HTTP response for '{doc.method} {doc.path}'.",
                        code_reality=f"Code executes asynchronously via {code_ep.event_topic or 'event bus'} (HTTP {code_ep.status_code}).",
                        doc_id=doc.doc_id,
                        service_id=code_ep.service_id,
                        api_id=code_ep.id,
                        suggested_patch=f"Update doc to note asynchronous webhook response and subscribe to '{code_ep.event_topic or 'event'}'."
                    ))
        return alerts

class PhantomEndpointDriftRule(BaseDriftRule):
    """
    Detects phantom specifications: documentation describes an API endpoint that has zero implementation
    in any codebase.
    """
    rule_id = "DRIFT-003-PHANTOM"
    name = "Phantom Specification (Missing Code)"
    description = "Flags endpoints documented in PRD/architecture files that do not exist anywhere in code."

    def evaluate(self, doc_contracts: List[DocContract], code_endpoints: List[CodeEndpoint]) -> List[DriftAlert]:
        alerts = []
        all_code_paths = {(ep.method, ep.path) for ep in code_endpoints}
        service_eps_map = {}
        for ep in code_endpoints:
            service_eps_map.setdefault(ep.service_id, []).append(ep)

        for doc in doc_contracts:
            service_eps = service_eps_map.get(doc.service_id, [])
            exact_match = (doc.method, doc.path) in all_code_paths
            has_siblings = any(doc.domain_tag in ep.path.lower() for ep in service_eps)
            if not exact_match and not has_siblings:
                alerts.append(DriftAlert(
                    id=f"alert-phantom-{doc.id}",
                    rule_id=self.rule_id,
                    evaluator_origin="ast_rule",
                    severity="warning",
                    title=f"Phantom Specification: {doc.method} {doc.path}",
                    doc_spec=f"Doc line {doc.line_number}: specifies '{doc.method} {doc.path}'.",
                    code_reality="No route implementing this contract found in any active service codebase.",
                    doc_id=doc.doc_id,
                    service_id=doc.service_id,
                    suggested_patch="Implement this route or remove obsolete specification from planning document."
                ))
        return alerts

class UndocumentedEndpointRule(BaseDriftRule):
    """
    Detects undocumented code APIs: code exposes endpoints that have zero documentation coverage.
    """
    rule_id = "DRIFT-004-UNDOCUMENTED"
    name = "Undocumented API Surface"
    description = "Flags code endpoints that lack any associated .md documentation or PRD reference."

    def evaluate(self, doc_contracts: List[DocContract], code_endpoints: List[CodeEndpoint]) -> List[DriftAlert]:
        alerts = []
        doc_paths = {(doc.method, doc.path) for doc in doc_contracts}
        for ep in code_endpoints:
            is_documented = (ep.method, ep.path) in doc_paths or any(
                doc.domain_tag in ep.path.lower() for doc in doc_contracts
            )
            if not is_documented and not ep.path.startswith("/openapi") and not ep.path.startswith("/docs"):
                alerts.append(DriftAlert(
                    id=f"alert-undoc-{ep.id}",
                    rule_id=self.rule_id,
                    evaluator_origin="ast_rule",
                    severity="warning",
                    title=f"Undocumented Route: {ep.method} {ep.path}",
                    doc_spec="No planning document or PRD references this endpoint.",
                    code_reality=f"Declared at {ep.file_path}:{ep.line_number}.",
                    doc_id="none",
                    service_id=ep.service_id,
                    api_id=ep.id,
                    suggested_patch=f"Add specification section for '{ep.method} {ep.path}' in service documentation."
                ))
        return alerts
