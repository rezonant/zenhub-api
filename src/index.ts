import fetch from 'node-fetch';
export * from './gql';
import * as gql from './gql';
import * as graphql from 'graphql';

export interface IssueRef {
    repo_id: number;
    issue_number: number;
}

export interface ReleaseReport {
    title: string;
    description?: string;
    start_date: string;
    desired_end_date: string;
    repositories?: number[];
}

export interface PlusOne {
    created_at: string;
}

export interface IssueData {
    plus_ones: PlusOne[];
    estimate: Estimate;
    is_epic: boolean;
    pipelines: PipelinePosition[];
    pipeline: PipelinePosition;
}

export interface PipelinePosition {
    name: string;
    pipeline_id: string;
    workspace_id: string;
}

export interface Estimate {
    value: number;
}

export interface EpicData {
    total_epic_estimates: Estimate;
    estimate: Estimate;
    pipeline: PipelinePosition;
    pipelines: PipelinePosition[];
    issues: EpicIssue[];
}

export interface EpicIssue {
    issue_number: number;
    is_epic: boolean;
    repo_id: number;
    estimate: Estimate;
    pipelines: PipelinePosition[];
    pipeline: PipelinePosition;
}

export interface Workspace {
    name: string;
    description: string;
    id: string;
    repositories: number[];
}

export interface Pipeline {
    id: string;
    name: string;
    issues: IssueData[];
}

export interface Board {
    pipelines: Pipeline[];
}

export interface Sprint {
    id: string;
    startAt: string;
    endAt: string;
    name: string;
    totalPoints: number;
    completedPoints: number;
}

export class ZenHub {
    constructor(readonly apiKey: string) { }
    
    graphqlKey: string;

    /**
     * The ZenHub API endpoint. Defaults tos 'https://api.zenhub.com'
     */
    endpoint: string = 'https://api.zenhub.com';
    graphqlEndpoint: string = 'https://api.zenhub.com/public/graphql';

    /**
     * Amount of times to retry a call when rate limited before giving up.
     */
    maxRetryCount = 3;

    /**
     * How many calls have been performed so far.
     */
    callsPerformed = 0;

    async graphql<T>(query: string, variables: Record<string,any>): Promise<gql.Query> {
        let response = await fetch(this.graphqlEndpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${this.graphqlKey}`
            },
            body: JSON.stringify({ query, variables })
        })

        if (response.status >= 400)
            throw new Error(`GraphQL query '${query}' failed: status ${response.status}. Response: '${await response.text()}'`);

        let result = <graphql.ExecutionResult<gql.Query>>await response.json();

        if (result.errors)
            throw new Error(`Error during GraphQL '${query.replace(/\r?\n/g, ' ').replace(/  +/g, ' ').trim()}' with variables ${JSON.stringify(variables)}: ${JSON.stringify(result.errors)}`);
        return result.data;
    }

    async restCall<BodyT = any, ResponseT = any>(method: string, url: string, body?: BodyT, retryCount = 0): Promise<ResponseT> {
        this.callsPerformed += 1;
        let response = await fetch(`${this.endpoint}${url}`, {
            headers: {
                'x-authentication-token': this.apiKey,
                'content-type': 'application/json'
            },
            method: method,
            body: JSON.stringify(body)
        });
        
        if (Number(response.status) === 403) {
            // Rate limited.
            console.log(`[ZenHub] Rate limited (attempt #${retryCount + 1}). Resets at ${response.headers.get('x-ratelimit-reset')}`);

            if (retryCount < this.maxRetryCount) {
                let resetsAt = new Date(Number(response.headers.get('x-ratelimit-reset')) * 1000);
                let date = new Date(response.headers.get('date'));
                let diff = resetsAt.getTime() - date.getTime() + 100;

                if (!isNaN(diff)) {
                    console.log(`[ZenHub] Waiting ${diff}ms to retry.`);
                    await new Promise(r => setTimeout(r, diff));
                    return await this.restCall(method, url, body, retryCount + 1);
                }
            }
        }

        if (response.status >= 400)
            throw new Error(`ZenHub: Error during ${method} ${url}: Status ${response.status}, body: '${await response.text()}'`);
        
        let text = await response.text();

        if (text === '')
            return undefined;
        
        try {
            return  <ResponseT>JSON.parse(text);
        } catch (e) {
            throw new Error(`[Zenhub] Failed to parse response to ${method} '${url}': ${e.message}. Body was '${text}'`);
        }
    }
    
    getIssueData(repo_id: number, issue_number: number): Promise<IssueData> {
        return this.restCall('GET', `/p1/repositories/${repo_id}/issues/${issue_number}`)
    }
    
    getIssueEvents(repo_id: number, issue_number: number) {
        return this.restCall('GET', `/p1/repositories/${repo_id}/issues/${issue_number}/events`)
    }
    
    getBoardForWorkspace(workspace_id: string, repo_id: number): Promise<Board> {
        return this.restCall('GET', `/p2/workspaces/${workspace_id}/repositories/${repo_id}/board`)
    }
    
    getOldestBoardForRepo(repo_id: number): Promise<Board> {
        return this.restCall('GET', `/p1/repositories/${repo_id}/board`);
    }
    
    getWorkspaces(repo_id: number): Promise<Workspace[]> {
        return this.restCall('GET', `/p2/repositories/${repo_id}/workspaces`);
    }

    getEpics(repo_id: number) {
        return this.restCall('GET', `/p1/repositories/${repo_id}/epics`)
    }

    async addIssuesToSprint(sprintIds: string[], issueIds: string[]) {
        await this.graphql(`
            mutation addIssuesToSprints($issueIds: [ID!]!, $sprintIds: [ID!]!) {
                addIssuesToSprints(input: {
                    issueIds: $issueIds,
                    sprintIds: $sprintIds
                }) {
                    sprintIssues {
                        id
                    }
                }
            }
        `, {
            issueIds,
            sprintIds
        })
    }
    
    async getActiveSprint(workspace_id: string): Promise<Sprint> {
        let result = await this.graphql(`
          query getWorkspace($workspace_id: ID!) {
            workspace(id: $workspace_id) {
              id
              activeSprint {
                id
                startAt
                endAt
                name
                totalPoints
                completedPoints
              }
            }
          }
        `, { workspace_id });

        return <Sprint>result.workspace.activeSprint;
    }
    
    async getZenhubIssueID(repo_id: number, issue_number: number) {
        let result = await this.graphql(`
            query($repo_id: Int!, $issue_number: Int!) {
                issueByInfo(repositoryGhId: $repo_id, issueNumber: $issue_number) {
                    id
                }
            }
        `, { repo_id, issue_number })

        return result.issueByInfo.id;
    }

    getEpicData(repo_id: number, epic_id: number): Promise<EpicData> {
        return this.restCall('GET', `/p1/repositories/${repo_id}/epics/${epic_id}`)
    }
    
    changePipeline(repo_id: number, issue_number: number, pipeline_id: string, position: string | number) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/issues/${issue_number}/moves`, {
            pipeline_id, position
        });
    }
    
    setEstimate(repo_id: number, issue_number: number, estimate: number) {
        return this.restCall('PUT', `/p1/repositories/${repo_id}/issues/${issue_number}/estimate`, { estimate })
    }
    
    convertToEpic(repo_id: number, issue_number: number, issues: IssueRef[]) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/issues/${issue_number}/convert_to_epic`, { issues })
    }
    
    convertToIssue(repo_id: number, issue_number: number) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/epics/${issue_number}/convert_to_issue`)
    }
    
    addToEpic(repo_id: number, epic_number: number, issues: IssueRef[]) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/epics/${epic_number}/update_issues`, { add_issues: issues });
    }

    removeFromEpic(repo_id: number, epic_number: number, issues: IssueRef[]) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/epics/${epic_number}/update_issues`, { remove_issues: issues })
    }
    
    createReleaseReport(repo_id: number, report: ReleaseReport) {
        return this.restCall('POST', `/p1/repositories/${repo_id}/reports/release`, report)
    }
    
    getReleaseReport(release_id: number): Promise<ReleaseReport> {
        return this.restCall('GET', `/p1/reports/release/${release_id}`)
    }
    
    getReleaseReportsForRepo(repo_id: number): Promise<ReleaseReport[]> {
        return this.restCall('GET', `/p1/repositories/${repo_id}/reports/releases`)
    }
    
    editReleaseReport(release_id: number, report: Partial<ReleaseReport>): Promise<ReleaseReport> {
        return this.restCall('PATCH', `/p1/reports/release/${release_id}`, report);
    }
}