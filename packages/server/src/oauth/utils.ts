import { ClientApplication, Login, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { allOk, badRequest, notFound, repo, RepositoryResult } from '../fhir';
import { Operator } from '../fhir/search';

/**
 * Searches for user by email.
 * @param email
 * @return
 */
export async function getUserByEmail(email: string): RepositoryResult<User | undefined> {
  const [outcome, bundle] = await repo.search({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });

  if (outcome.id !== 'allok') {
    return [outcome, undefined];
  }

  if (!bundle?.entry || bundle.entry.length === 0) {
    return [notFound, undefined];
  }

  return [allOk, bundle.entry[0].resource as User];
}

/**
 * Logs in the user with email address and password.
 * Returns the user on success.
 *
 * @param email The user's email address.
 * @param password The user's plain text password.
 * @return the user details.
 */
export async function createLogin(client: ClientApplication, email: string, password: string): RepositoryResult<Login | undefined> {
  const [outcome, user] = await getUserByEmail(email);
  if (outcome.id !== 'allok' && outcome.id !== 'not-found') {
    return [outcome, undefined];
  }

  if (!user) {
    return [badRequest('User not found', 'email'), undefined];
  }

  const passwordHash = user?.passwordHash;
  if (!passwordHash) {
    return [badRequest('Invalid user', 'email'), undefined];
  }

  const bcryptResult = await bcrypt.compare(password, passwordHash);
  if (!bcryptResult) {
    return [badRequest('Incorrect password', 'password'), undefined];
  }

  return repo.createResource({
    resourceType: 'Login',
    client: {
      reference: client.resourceType + '/' + client.id,
    },
    user: {
      reference: user.resourceType + '/' + user.id
    }
  });
}