# Transformation mapping rules
# Import all mapper modules so their register_mapper() calls fire on package load.
from app.mapping.python_mapper import PythonMapper          # noqa: F401
from app.mapping.typescript_mapper import TypeScriptMapper  # noqa: F401
from app.mapping.javascript_mapper import JavaScriptMapper  # noqa: F401
from app.mapping.java_mapper import JavaMapper              # noqa: F401
from app.mapping.csharp_mapper import CSharpMapper          # noqa: F401
