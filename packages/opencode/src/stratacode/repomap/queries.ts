// stratacode_change - new file
// Bundled tree-sitter tag queries per language.
// Each query extracts definition and reference captures used by the repo map engine.

export const TYPESCRIPT = `
;; Function declarations
(function_declaration
  name: (identifier) @name.definition.function)

;; Arrow functions assigned to const/let
(lexical_declaration
  (variable_declarator
    name: (identifier) @name.definition.function
    value: (arrow_function)))

;; Class declarations
(class_declaration
  name: (type_identifier) @name.definition.class)

;; Interface declarations
(interface_declaration
  name: (type_identifier) @name.definition.interface)

;; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @name.definition.interface)

;; Method definitions
(method_definition
  name: (property_identifier) @name.definition.function)

;; Enum declarations
(enum_declaration
  name: (identifier) @name.definition.class)

;; Import sources (for ranking edges)
(import_statement
  source: (string) @name.reference.import)
`

export const PYTHON = `
;; Function definitions
(function_definition
  name: (identifier) @name.definition.function)

;; Class definitions
(class_definition
  name: (identifier) @name.definition.class)

;; Decorated function definitions
(decorated_definition
  definition: (function_definition
    name: (identifier) @name.definition.function))

;; Decorated class definitions
(decorated_definition
  definition: (class_definition
    name: (identifier) @name.definition.class))

;; Import statements (for ranking edges)
(import_from_statement
  module_name: (dotted_name) @name.reference.import)

(import_statement
  name: (dotted_name) @name.reference.import)
`

export const GO = `
;; Function declarations
(function_declaration
  name: (identifier) @name.definition.function)

;; Method declarations
(method_declaration
  name: (field_identifier) @name.definition.function)

;; Type declarations (struct, interface, etc.)
(type_declaration
  (type_spec
    name: (type_identifier) @name.definition.class))

;; Import paths (for ranking edges)
(import_spec
  path: (interpreted_string_literal) @name.reference.import)
`

export const RUST = `
;; Function definitions
(function_item
  name: (identifier) @name.definition.function)

;; Struct definitions
(struct_item
  name: (type_identifier) @name.definition.class)

;; Enum definitions
(enum_item
  name: (type_identifier) @name.definition.class)

;; Trait definitions
(trait_item
  name: (type_identifier) @name.definition.interface)

;; Impl blocks
(impl_item
  type: (type_identifier) @name.definition.class)

;; Type alias
(type_item
  name: (type_identifier) @name.definition.interface)

;; Use declarations (for ranking edges)
(use_declaration
  argument: (scoped_identifier) @name.reference.import)
`

export const JAVA = `
;; Class declarations
(class_declaration
  name: (identifier) @name.definition.class)

;; Interface declarations
(interface_declaration
  name: (identifier) @name.definition.interface)

;; Method declarations
(method_declaration
  name: (identifier) @name.definition.function)

;; Constructor declarations
(constructor_declaration
  name: (identifier) @name.definition.function)

;; Enum declarations
(enum_declaration
  name: (identifier) @name.definition.class)

;; Import declarations (for ranking edges)
(import_declaration
  (scoped_identifier) @name.reference.import)
`

export const C = `
;; Function definitions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name.definition.function))

;; Struct definitions
(struct_specifier
  name: (type_identifier) @name.definition.class)

;; Enum definitions
(enum_specifier
  name: (type_identifier) @name.definition.class)

;; Typedef
(type_definition
  declarator: (type_identifier) @name.definition.interface)

;; Include directives (for ranking edges)
(preproc_include
  path: (_) @name.reference.import)
`

export const RUBY = `
;; Method definitions
(method
  name: (identifier) @name.definition.function)

;; Singleton method definitions
(singleton_method
  name: (identifier) @name.definition.function)

;; Class definitions
(class
  name: (constant) @name.definition.class)

;; Module definitions
(module
  name: (constant) @name.definition.module)

;; Require calls (for ranking edges)
(call
  method: (identifier) @_method
  arguments: (argument_list
    (string) @name.reference.import)
  (#eq? @_method "require"))
`

export const PHP = `
;; Function definitions
(function_definition
  name: (name) @name.definition.function)

;; Method declarations
(method_declaration
  name: (name) @name.definition.function)

;; Class declarations
(class_declaration
  name: (name) @name.definition.class)

;; Interface declarations
(interface_declaration
  name: (name) @name.definition.interface)

;; Trait declarations
(trait_declaration
  name: (name) @name.definition.class)

;; Namespace definitions
(namespace_definition
  name: (namespace_name) @name.definition.module)

;; Use declarations (for ranking edges)
(namespace_use_declaration
  (namespace_use_clause
    (qualified_name) @name.reference.import))
`

/**
 * Map of language name to query string.
 * Language names correspond to the tree-sitter WASM file basename
 * (e.g. "typescript" → tree-sitter-typescript.wasm).
 */
export const QUERIES: Record<string, string> = {
  typescript: TYPESCRIPT,
  javascript: TYPESCRIPT, // JS uses the TS parser; AST is compatible
  python: PYTHON,
  go: GO,
  rust: RUST,
  java: JAVA,
  c: C,
  cpp: C, // C++ reuses the C query subset
  ruby: RUBY,
  php: PHP,
}

/**
 * Map file extensions to the language key used in QUERIES and for WASM loading.
 * The parser key determines which WASM file is loaded;
 * the query key determines which query string is used.
 */
export interface LangMapping {
  parser: string
  query: string
}

export const EXTENSIONS: Record<string, LangMapping> = {
  ".ts": { parser: "typescript", query: "typescript" },
  ".tsx": { parser: "typescript", query: "typescript" },
  ".mts": { parser: "typescript", query: "typescript" },
  ".cts": { parser: "typescript", query: "typescript" },
  ".js": { parser: "javascript", query: "javascript" },
  ".jsx": { parser: "javascript", query: "javascript" },
  ".mjs": { parser: "javascript", query: "javascript" },
  ".cjs": { parser: "javascript", query: "javascript" },
  ".py": { parser: "python", query: "python" },
  ".go": { parser: "go", query: "go" },
  ".rs": { parser: "rust", query: "rust" },
  ".java": { parser: "java", query: "java" },
  ".c": { parser: "c", query: "c" },
  ".h": { parser: "c", query: "c" },
  ".cpp": { parser: "cpp", query: "cpp" },
  ".hpp": { parser: "cpp", query: "cpp" },
  ".cc": { parser: "cpp", query: "cpp" },
  ".cxx": { parser: "cpp", query: "cpp" },
  ".rb": { parser: "ruby", query: "ruby" },
  ".php": { parser: "php", query: "php" },
}
