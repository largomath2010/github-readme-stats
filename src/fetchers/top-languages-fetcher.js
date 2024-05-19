// @ts-check
import * as dotenv from "dotenv";
import { retryer } from "../common/retryer.js";
import { logger, MissingParamError, request } from "../common/utils.js";

dotenv.config();

/**
 * @param {import('Axios').AxiosRequestHeaders} variables
 * @param {string} token
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          repositoriesContributedTo(contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY], first: 100) {
            nodes {
              name,
              isPrivate,
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

/**
 * @param {string} username
 * @param {string[]} exclude_repo
 * @returns {Promise<import("./types").TopLangData>}
 */
async function fetchTopLanguages(username, exclude_repo = [], count_private = true) {
  if (!username) throw new MissingParamError(["username"]);

  console.log("Prepare fetch top languages api.")
  const res = await retryer(fetcher, { login: username });

  if (res.data.errors) {
    console.log("Errors: ", res.data.errors)
    logger.error(res.data.errors);
    throw Error(res.data.errors[0].message || "Could not fetch user");
  }

  console.log("Fetch top languages api user.", res.data.data.user)
  let user = res.data.data.user;
  let repo = user.repositories ? user.repositories : user.repositoriesContributedTo;
  let repoNodes = repo.nodes;
  let repoToHide = {};

  // populate repoToHide map for quick lookup
  // while filtering out
  if (exclude_repo) {
    exclude_repo.forEach((repoName) => {
      repoToHide[repoName] = true;
    });
  }

  // filter out repositories to be hidden
  repoNodes = repoNodes
    .sort((a, b) => b.size - a.size)
    .filter((name) => !repoToHide[name.name]);

  // filter out private repositories if needed
  if (!count_private) {
    repoNodes = repoNodes.filter(repo => !repo.isPrivate);
  }

  repoNodes = repoNodes
    .filter((node) => node.languages.edges.length > 0)
    // flatten the list of language nodes
    .reduce((acc, curr) => curr.languages.edges.concat(acc), [])
    .reduce((acc, prev) => {
      // get the size of the language (bytes)
      let langSize = prev.size;

      // if we already have the language in the accumulator
      // & the current language name is same as previous name
      // add the size to the language size.
      if (acc[prev.node.name] && prev.node.name === acc[prev.node.name].name) {
        langSize = prev.size + acc[prev.node.name].size;
      }
      return {
        ...acc,
        [prev.node.name]: {
          name: prev.node.name,
          color: prev.node.color,
          size: langSize,
        },
      };
    }, {});

  const topLangs = Object.keys(repoNodes)
    .sort((a, b) => repoNodes[b].size - repoNodes[a].size)
    .reduce((result, key) => {
      result[key] = repoNodes[key];
      return result;
    }, {});

  return topLangs;
}

export { fetchTopLanguages };
export default fetchTopLanguages;
