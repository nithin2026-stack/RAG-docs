import json

data = [
    {"question": "How do you define a path parameter in FastAPI?",
     "ground_truth": "You define a path parameter by declaring it as a function parameter with a type hint, e.g. @app.get('/items/{item_id}') def read_item(item_id: int)."},
    {"question": "What is the purpose of the Depends function?",
     "ground_truth": "Depends is used for dependency injection, allowing shared logic like authentication or database sessions to be reused across path operations."},
    {"question": "How do you define a query parameter in FastAPI?",
     "ground_truth": "Query parameters are function parameters not part of the path - FastAPI automatically detects them and reads them from the URL's query string."},
    {"question": "How do you send data in a request body?",
     "ground_truth": "You declare a Pydantic model and use it as a function parameter; FastAPI reads the JSON body and validates it against that model."},
    {"question": "What is FastAPI's Dependency Injection system used for?",
     "ground_truth": "It lets you declare shared logic (like database connections or authentication) as dependencies that FastAPI automatically calls and injects into your path operation functions."},
    {"question": "How do you deploy FastAPI to AWS Lambda?",
     "ground_truth": "NOT_FOUND - not covered in the provided documentation."},
    {"question": "What does the first-steps FastAPI example return by default?",
     "ground_truth": "A minimal example returns a JSON object like {'message': 'Hello World'} from a GET request handler."},
    {"question": "How do you run a FastAPI application locally?",
     "ground_truth": "You run it using a server like Uvicorn, e.g. uvicorn main:app --reload."},
    {"question": "What type hints does FastAPI use path parameters for?",
     "ground_truth": "FastAPI uses standard Python type hints (e.g. int, str) to validate and convert path parameters automatically."},
    {"question": "What happens if you send an invalid type for a path parameter?",
     "ground_truth": "FastAPI automatically returns a clear validation error response before your function code even runs."},
    {"question": "Are query parameters required or optional by default in FastAPI?",
     "ground_truth": "Query parameters are optional by default unless you don't give them a default value, in which case they become required."},
    {"question": "How do you give a query parameter a default value?",
     "ground_truth": "You assign a default value directly in the function signature, e.g. def read_item(q: str = None)."},
    {"question": "What library does FastAPI use to define request body models?",
     "ground_truth": "FastAPI uses Pydantic models to define and validate request bodies."},
    {"question": "Can you combine path parameters, query parameters, and a request body in one endpoint?",
     "ground_truth": "Yes, FastAPI lets you declare path parameters, query parameters, and body parameters together in the same function signature."},
    {"question": "How does FastAPI validate a request body automatically?",
     "ground_truth": "Since the body is defined as a Pydantic model, FastAPI validates incoming JSON against that model's types and constraints automatically."},
    {"question": "Can a dependency in FastAPI have its own sub-dependencies?",
     "ground_truth": "Yes, dependencies can depend on other dependencies, and FastAPI resolves the whole chain automatically."},
    {"question": "How do you connect FastAPI to a PostgreSQL database?",
     "ground_truth": "NOT_FOUND - not covered in the provided documentation."},
]

with open("golden_dataset.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print(f"Wrote {len(data)} pairs to golden_dataset.json")