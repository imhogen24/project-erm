// One answer on the website form, with its label.
export type ClientAnswer = { label: string; value: string }

// What the client request panel shows.
export type ClientRequest = { requestId: string; answers: ClientAnswer[] }
