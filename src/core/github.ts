/** Read-only repository exploration; credentials and HTTP stay in the server adapter. */
export interface GitHubQuery {
 action: "repos" | "tree" | "read_file" | "search_code" | "issues" | "issue" | "pull_requests" | "pull_request";
 repo?: string;
 ref?: string;
 path?: string;
 query?: string;
 number?: number;
 page?: number;
 part?: "details" | "comments" | "reviews" | "review_comments" | "files";
}
export interface GitHubReader { read(query: GitHubQuery): Promise<unknown>; }
