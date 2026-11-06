import os
import re
from typing import List, Tuple
from app.models import FleetHDSpec, DocContract

class MarkdownParser:
    """
    Parses Markdown (.md) documents and FleetHD PRD templates into
    structured sections, metadata, and extracted API contracts.
    """

    @staticmethod
    def parse_file(file_path: str) -> Tuple[FleetHDSpec, List[DocContract]]:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        doc_id = os.path.basename(file_path).replace(".md", "")
        lines = content.split("\n")

        # 1. Title Extraction
        title = doc_id
        for line in lines:
            if line.startswith("# "):
                title = line.replace("# ", "").strip()
                break

        # 2. Team Metadata Extraction
        owning_team = "Unknown Team"
        collaborating_team = None
        for line in lines:
            lower = line.lower()
            if "owning team" in lower:
                parts = line.split(":")
                if len(parts) > 1:
                    owning_team = parts[1].replace("*", "").strip()
            elif "collaborating team" in lower:
                parts = line.split(":")
                if len(parts) > 1:
                    collaborating_team = parts[1].replace("*", "").strip()

        # 3. Section Extraction
        objective = ""
        user_stories = []
        scope_in = []
        scope_out = []
        success_criteria = []
        technical_changes = []

        current_section = None
        for line in lines:
            line_stripped = line.strip()
            lower = line_stripped.lower()

            if "objective" in lower and lower.startswith("#"):
                current_section = "objective"
                continue
            elif "user stories" in lower and lower.startswith("#"):
                current_section = "user_stories"
                continue
            elif "in scope" in lower and lower.startswith("#"):
                current_section = "scope_in"
                continue
            elif "out of scope" in lower and lower.startswith("#"):
                current_section = "scope_out"
                continue
            elif "success criteria" in lower and lower.startswith("#"):
                current_section = "success_criteria"
                continue
            elif "technical changes" in lower and lower.startswith("#"):
                current_section = "technical_changes"
                continue
            elif line_stripped.startswith("## ") or line_stripped.startswith("# "):
                current_section = "other"
                continue

            if not line_stripped:
                continue

            if current_section == "objective":
                if not line_stripped.startswith("#"):
                    objective += line_stripped + " "
            elif current_section == "user_stories" and (line_stripped.startswith("-") or line_stripped.startswith("*")):
                user_stories.append(line_stripped.lstrip("- *").strip())
            elif current_section == "scope_in" and (line_stripped.startswith("-") or line_stripped.startswith("✔") or line_stripped.startswith("*")):
                scope_in.append(line_stripped.lstrip("- *✔").strip())
            elif current_section == "scope_out" and (line_stripped.startswith("-") or line_stripped.startswith("✖") or line_stripped.startswith("*")):
                scope_out.append(line_stripped.lstrip("- *✖").strip())
            elif current_section == "success_criteria" and (line_stripped[0].isdigit() or line_stripped.startswith("-") or line_stripped.startswith("*")):
                success_criteria.append(line_stripped.lstrip("0123456789.- *").strip())
            elif current_section == "technical_changes":
                technical_changes.append(line_stripped)

        spec = FleetHDSpec(
            id=doc_id,
            title=title,
            doc_path=file_path,
            owning_team=owning_team,
            collaborating_team=collaborating_team,
            objective=objective.strip(),
            user_stories=user_stories,
            scope_in=scope_in,
            scope_out=scope_out,
            success_criteria=success_criteria,
            technical_changes=technical_changes,
            raw_markdown=content
        )

        # 4. Extract API Contracts
        contracts: List[DocContract] = []
        
        # Target service heuristic
        target_service = "payment-service" if "payment" in content.lower() else "checkout-service"
        for line in lines:
            if "service name" in line.lower() or "target service" in line.lower():
                parts = line.split(":")
                if len(parts) > 1:
                    target_service = parts[1].replace("`", "").replace("*", "").strip()

        # Strategy A: Inline pattern like `POST /v1/refunds` or `POST /api/...`
        inline_pattern = re.compile(r'\b(GET|POST|PUT|DELETE|PATCH)\b[:\s`*]+([/][a-zA-Z0-9_\-\/{}]*)', re.IGNORECASE)
        
        for idx, line in enumerate(lines, start=1):
            matches = inline_pattern.findall(line)
            for method, path in matches:
                method_upper = method.upper()
                context_block = "\n".join(lines[max(0, idx - 4):min(len(lines), idx + 5)]).lower()
                is_sync = not ("async" in context_block or "kafka" in context_block or "event" in context_block)
                domain_tag = "refund" if "refund" in path.lower() else "payment" if "payment" in path.lower() else "order"
                
                contract_id = f"contract-{doc_id}-{method_upper}-{path.replace('/', '_')}"
                if not any(c.id == contract_id for c in contracts):
                    contracts.append(DocContract(
                        id=contract_id,
                        doc_id=doc_id,
                        doc_path=file_path,
                        line_number=idx,
                        method=method_upper,
                        path=path,
                        is_sync=is_sync,
                        service_id=target_service,
                        domain_tag=domain_tag,
                        raw_text=line.strip()
                    ))

        # Strategy B: Multi-line bullet points pattern:
        # - **HTTP Method**: POST
        # - **Endpoint**: /v1/refunds
        current_method = None
        current_method_line = 1
        for idx, line in enumerate(lines, start=1):
            method_match = re.search(r'method\*\*?[:\s`]+(GET|POST|PUT|DELETE|PATCH)', line, re.IGNORECASE)
            if method_match:
                current_method = method_match.group(1).upper()
                current_method_line = idx

            endpoint_match = re.search(r'endpoint\*\*?[:\s`]+([/][a-zA-Z0-9_\-\/{}]*)', line, re.IGNORECASE)
            if endpoint_match and current_method:
                path = endpoint_match.group(1).strip("`* ")
                context_block = "\n".join(lines[max(0, idx - 4):min(len(lines), idx + 5)]).lower()
                is_sync = not ("async" in context_block or "kafka" in context_block or "event" in context_block)
                domain_tag = "refund" if "refund" in path.lower() else "payment" if "payment" in path.lower() else "order"

                contract_id = f"contract-{doc_id}-{current_method}-{path.replace('/', '_')}"
                if not any(c.id == contract_id for c in contracts):
                    contracts.append(DocContract(
                        id=contract_id,
                        doc_id=doc_id,
                        doc_path=file_path,
                        line_number=current_method_line,
                        method=current_method,
                        path=path,
                        is_sync=is_sync,
                        service_id=target_service,
                        domain_tag=domain_tag,
                        raw_text=f"{current_method} {path}"
                    ))
                current_method = None  # Reset after pair

        return spec, contracts
