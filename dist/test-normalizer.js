import { normalize } from "./semantic";
const samples = [
    "PROJECT_BRAIN_DIRECTORY_NAME",
    "GraphBuilderService",
    "IWorkspaceService",
    "read_json_file",
    "kebab-case-example",
    "JWTAuthenticationMiddleware"
];
for (const sample of samples) {
    console.log(sample);
    console.log(normalize(sample));
    console.log("--------------------");
}
