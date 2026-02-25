export type XTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export type XUser = {
  id: string;
  username?: string;
  name?: string;
};

export type XSearchTweet = {
  id: string;
  text: string;
  author_id: string;
  lang?: string;
  public_metrics?: {
    like_count?: number;
  };
};
