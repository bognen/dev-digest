import { Octokit } from '@octokit/rest';

export interface GitHubLabel {
  name: string;
  color: string;
}

export class OctokitClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listLabels(owner: string, repo: string): Promise<GitHubLabel[]> {
    const res = await this.octokit.paginate(this.octokit.issues.listLabelsForRepo, { owner, repo });
    return res.map((l) => ({ name: l.name, color: '#' + l.color }));
  }
}
