import fetch from 'node-fetch';

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

export class ZenHub {
    constructor(readonly apiKey: string) { }
    
    /**
    * The ZenHub API endpoint (including /p1). Defaults tos 'https://api.zenhub.com/p1'
    */
    endpoint: string = 'https://api.zenhub.com/p1';
    
    async apiCall<BodyT = any, ResponseT = any>(method: string, url: string, body?: BodyT): Promise<ResponseT> {
        let response = await fetch(`${this.endpoint}${url}`, {
            headers: {
                'x-authentication-token': this.apiKey,
                'content-type': 'application/json'
            },
            method: method,
            body: JSON.stringify(body)
        });
        
        if (response.status >= 400)
        throw new Error(`ZenHub: Error during ${method} ${url}: Status ${response.status}`);
        
        return <ResponseT>await response.json();
    }
    
    getIssueData(repo_id: number, issue_number: number) {
        return this.apiCall('GET', `/repositories/${repo_id}/issues/${issue_number}`)
    }
    
    getIssueEvents(repo_id: number, issue_number: number) {
        return this.apiCall('GET', `/repositories/${repo_id}/issues/${issue_number}/events`)
    }
    
    getBoard(repo_id: number) {
        return this.apiCall('GET', `/repositories/${repo_id}/board`)
    }
    
    getEpics(repo_id: number) {
        return this.apiCall('GET', `/repositories/${repo_id}/epics`)
    }
    
    getEpicData(repo_id: number, epic_id: number) {
        return this.apiCall('GET', `/repositories/${repo_id}/epics/${epic_id}`)
    }
    
    changePipeline(repo_id: number, issue_number: number, pipeline_id: string, position: string | number) {
        return this.apiCall('POST', `/repositories/${repo_id}/issues/${issue_number}/moves`, {
            pipeline_id, position
        });
    }
    
    setEstimate(repo_id: number, issue_number: number, estimate: number) {
        return this.apiCall('PUT', `/repositories/${repo_id}/issues/${issue_number}/estimate`, { estimate })
    }
    
    convertToEpic(repo_id: number, issue_number: number, issues: IssueRef[]) {
        return this.apiCall('POST', `/repositories/${repo_id}/issues/${issue_number}/convert_to_epic`, { issues })
    }
    
    convertToIssue(repo_id: number, issue_number: number) {
        return this.apiCall('POST', `/repositories/${repo_id}/epics/${issue_number}/convert_to_issue`)
    }
    
    addToEpic(repo_id: number, epic_number: number, issues: IssueRef[]) {
        return this.apiCall('POST', `/repositories/${repo_id}/epics/${epic_number}/update_issues`, { add_issues: issues });
    }

    removeFromEpic(repo_id: number, epic_number: number, issues: IssueRef[]) {
        return this.apiCall('POST', `/repositories/${repo_id}/epics/${epic_number}/update_issues`, { remove_issues: issues })
    }
    
    createReleaseReport(repo_id: number, report: ReleaseReport) {
        return this.apiCall('POST', `/repositories/${repo_id}/reports/release`, report)
    }
    
    getReleaseReport(release_id: number): Promise<ReleaseReport> {
        return this.apiCall('GET', `/reports/release/${release_id}`)
    }
    
    getReleaseReportsForRepo(repo_id: number): Promise<ReleaseReport[]> {
        return this.apiCall('GET', `/repositories/${repo_id}/reports/releases`)
    }
    
    editReleaseReport(release_id: number, report: Partial<ReleaseReport>): Promise<ReleaseReport> {
        return this.apiCall('PATCH', `/reports/release/${release_id}`, report);
    }
}