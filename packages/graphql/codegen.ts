import type { CodegenConfig } from '@graphql-codegen/cli';
const config: CodegenConfig = {
  schema: '../../packages/graphql/schema.graphql',
  documents: ['../../packages/graphql/operations.graphql'],
  generates: { 'src/generated/graphql.ts': { plugins: ['typescript', 'typescript-operations'] } },
  ignoreNoDocuments: false,
};
export default config;
