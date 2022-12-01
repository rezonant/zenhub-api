import type { CodegenConfig } from '@graphql-codegen/cli'
 
const config: CodegenConfig = {
   schema: [
    {
      'https://api.zenhub.com/public/graphql': {
        headers: {
          Authorization: `Bearer ${process.env.ZENHUB_GQL_TOKEN}`
        }
      }
    }
   ],
   generates: {
      './src/gql.ts': {
        plugins: [
          '@graphql-codegen/typescript',
          '@graphql-codegen/typescript-operations'
        ],
        
      }
   }
}
export default config