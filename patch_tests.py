import os
import glob
import re

files = glob.glob('packages/opencode/test/**/*.ts', recursive=True)

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    if "Layer.mergeAll(" in content and "SessionProcessor.layer" in content:
        if "ACPAdapterLayer" not in content:
            print(f"Patching {file}")
            content = content.replace(
                'import { SessionProcessor } from "../../src/session/processor"',
                'import { SessionProcessor } from "../../src/session/processor"\nimport { defaultLayer as ACPAdapterLayer } from "../../src/stratacode/acp-client/adapter"\nimport { defaultLayer as ACPManagerLayer } from "../../src/stratacode/acp-client/manager"'
            )
            content = content.replace(
                'import { SessionProcessor } from "../../src/session/processor"',
                'import { SessionProcessor } from "../../src/session/processor"\nimport { defaultLayer as ACPAdapterLayer } from "../../src/stratacode/acp-client/adapter"\nimport { defaultLayer as ACPManagerLayer } from "../../src/stratacode/acp-client/manager"'
            ) # Just in case it's different path... wait, let's just insert at the end of imports.
            
            # Find last import
            last_import = max(content.rfind('import '), content.rfind('import type '))
            next_newline = content.find('\n', last_import)
            
            # Just do a simple regex for deps = Layer.mergeAll(
            new_deps = re.sub(
                r'(const deps = Layer\.mergeAll\([\s\S]*?)(status,)',
                r'\1status,\n  ACPAdapterLayer,\n  ACPManagerLayer,',
                content
            )
            
            if new_deps != content:
                # Add imports
                new_deps = new_deps.replace(
                    'import { SessionProcessor } from "../../src/session/processor"',
                    'import { SessionProcessor } from "../../src/session/processor"\nimport { defaultLayer as ACPAdapterLayer } from "../../src/stratacode/acp-client/adapter"\nimport { defaultLayer as ACPManagerLayer } from "../../src/stratacode/acp-client/manager"'
                )
                with open(file, 'w') as f:
                    f.write(new_deps)

