import {addEmptyRepliesListing, getEmptyRepliesListing} from '../helper'
import {emptyChildren as emptyMoreObject} from './More'
import VoteableContent from './VoteableContent'
import type snoowrap from '../snoowrap'
import type Listing from './Listing'


interface Comment {
  body_html: string
  body: string
  collapsed_reason: any // ?
  collapsed: boolean
  controversiality: number
  depth: number
  ignore_reports: boolean
  /** True if comment author is the same as the Submission author */
  is_submitter: boolean
  link_id: string
  parent_id: string
  removed: boolean
  replies: Listing<Comment>
  score_hidden: boolean
  spam: boolean
}

/**
 * A class representing a reddit comment
 * @example
 *
 * // Get a comment with the given ID
 * r.getComment('c0hkuyq')
 */
class Comment extends VoteableContent {
  static _name = 'Comment'

  _sort?: string
  _children: {[id: string]: Comment}
  _cb?: (_: any) => void

  constructor (
    {_children = {}, ...options}: {[key: string]: any},
    _r: snoowrap,
    _hasFetched = false
  ) {
    super(options, _r, _hasFetched)
    this._children = _children

    if (_hasFetched) {
      if (options.replies === '') {
        /**
         * If a comment has no replies, reddit returns an empty string as its `replies` property rather than an empty Listing.
         * This behavior is unexpected, so replace the empty string with an empty Listing.
         */
        this.replies = this._r._newObject('Listing', {children: [], _more: emptyMoreObject(), _isCommentList: true})
      } else if (this.replies.constructor._name === 'Listing' && !this.replies.length && this.replies._more && this.replies._more.name === 't1__') {
        /**
         * If a comment is in a deep comment chain, reddit will send a single `more` object with name `t1__` in place of the
         * comment's replies. This is the equivalent of seeing a 'Continue this thread' link on the HTML site, and it indicates that
         * replies should be fetched by sending another request to view the deep comment alone, and parsing the replies from that.
         */
        this.replies = getEmptyRepliesListing(this)
      } else if (this.replies._more && !this.replies._more.link_id) {
        this.replies._more.link_id = this.link_id
      }
    }
  }

  _transformApiResponse (response: any) {
    if (response.constructor._name === 'Submission') {
      const children = response._children
      response = response.comments[0]
      delete children[response.id]
      response._children = children
      response._sort = this._sort || null
      response._cb = this._cb || null
      if (this._cb) {
        this._cb(response)
      }
      return response
    }
    response[0]._sort = this._sort || null
    return addEmptyRepliesListing(response[0])
  }

  get _uri () {
    return !this.link_id
      ? `api/info?id=${this.name}`
      : `comments/${this.link_id.slice(3)}?comment=${this.name.slice(3)}${this._sort ? `&sort=${this._sort}` : ''}`
  }

  /**
   * @summary Fetch more replies and append them automatically to the replies listing. All replies and their
   * children will be exposed automatically to {@link Submission#getComment}.
   * @param {object|number} options - Object of fetching options or the number of replies to fetch. see
   * {@link Listing#fetchMore} for more details.
   * @returns {Promise} A Promise that fulfills with the replies listing.
   */
  async fetchMore (options) {
    if (typeof options !== 'number') {
      options.append = true
    }
    const comments = await this.replies.fetchMore(options)
    if (this._cb) {
      this._cb({_children: comments._children})
    }
    this.replies = comments
    return comments
  }

  /**
   * @summary Fetch all replies and append them automatically to the replies listing. All replies and their
   * children will be exposed automatically to {@link Submission#getComment}.
   * @param {object} [options] - Fetching options. see {@link Listing#fetchAll} for more details.
   * @returns {Promise} A Promise that fulfills with the replies listing.
   */
  fetchAll (options) {
    return this.fetchMore({...options, amount: Infinity})
  }

  /**
   * @summary Locks this Comment, preventing new comments from being posted on it.
   * @returns {Promise} The updated version of this Comment
   * @example r.getComment('d1xclfo').lock()
   */
  async lock () {
    await this._post({url: 'api/lock', form: {id: this.name}})
    return this
  }

  /**
   * @summary Unlocks this Comment, allowing comments to be posted on it again.
   * @returns {Promise} The updated version of this Comment
   * @example r.getComment('d1xclfo').unlock()
   */
  async unlock () {
    await this._post({url: 'api/unlock', form: {id: this.name}})
    return this
  }
}

export default Comment
