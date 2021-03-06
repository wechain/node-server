/**
 * @desc Article Services
 */

const ProxyService = require('./proxy')

module.exports = class ArticleService extends ProxyService {
    get model () {
        return this.app.model.Article
    }

    async getItemById (id, select, opt = {}, single = false) {
        let data = null
        const populate = [
            {
                path: 'category',
                select: 'name description extends'
            },
            {
                path: 'tag',
                select: 'name description extends'
            }
        ]
        if (!this.ctx.session._isAuthed) {
            // 前台博客访问文章的时候pv+1
            data = await this.updateItem({
                _id: id,
                state: this.config.modelEnum.article.state.optional.PUBLISH
            }, {
                $inc: { 'meta.pvs': 1 }
            }, Object.assign({}, opt, {
                select: '-content'
            }), populate)
        } else {
            data = await this.getItem({ _id: id }, opt, populate)
        }
        if (data && !single) {
            // 获取相关文章和上下篇文章
            const [related, adjacent] = await Promise.all([
                this.getRelatedArticles(data),
                this.getAdjacentArticles(data)
            ])
            data.related = related
            data.adjacent = adjacent
        }
        return data
    }

    async archives () {
        const $match = {}
        const $project = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            title: 1,
            createdAt: 1,
            source: 1
        }
        if (!this.ctx.session._isAuthed) {
            $match.state = 1
        } else {
            $project.state = 1
        }
        let data = await this.aggregate([
            { $match },
            { $sort: { createdAt: -1 } },
            { $project },
            {
                $group: {
                    _id: {
                        year: '$year',
                        month: '$month'
                    },
                    articles: {
                        $push: {
                            title: '$title',
                            _id: '$_id',
                            createdAt: '$createdAt',
                            state: '$state',
                            source: '$source'
                        }
                    }
                }
            }
        ])
        let total = 0
        if (data && data.length) {
            // 先取出year，并且降序排列，再填充month
            data = [...new Set(data.map(item => item._id.year).sort((a, b) => b - a))].map(year => {
                const months = []
                data.forEach(item => {
                    const { _id, articles } = item
                    if (year === _id.year) {
                        total += articles.length
                        months.push({
                            month: _id.month,
                            monthStr: this.app.utils.share.getMonthFromNum(_id.month),
                            articles
                        })
                    }
                })
                return {
                    year,
                    months: months.sort((a, b) => b.month - a.month)
                }
            })
        }
        return {
            total,
            list: data || []
        }
    }

    // 根据标签获取相关文章
    async getRelatedArticles (data) {
        if (!data || !data._id) return null
        const { _id, tag = [] } = data
        const articles = await this.getList(
            {
                _id: { $nin: [ _id ] },
                state: data.state,
                tag: { $in: tag.map(t => t._id) }
            },
            'title thumb createdAt publishedAt meta category',
            {
                sort: '-createdAt'
            },
            {
                path: 'category',
                select: 'name description'
            }
        )
        return articles && articles.slice(0, this.app.setting.limit.relatedArticleCount) || null
    }

    // 获取相邻的文章
    async getAdjacentArticles (data) {
        if (!data || !data._id) return null
        const query = {
            createdAt: {
                $lt: data.createdAt
            }
        }
        // 如果未通过权限校验，将文章状态重置为1
        if (!this.ctx.session._isAuthed) {
            query.state = this.config.modelEnum.article.state.optional.PUBLISH
        }
        const nextQuery = Object.assign({}, query, {
            createdAt: {
                $gt: data.createdAt
            }
        })
        const select = '-renderedContent'
        const opt = { sort: 'createdAt' }
        const populate = {
            path: 'category',
            select: 'name description'
        }
        const [prev, next] = await Promise.all([
            this.getItem(query, select, opt, populate),
            this.getItem(nextQuery, select, opt, populate)
        ])
        return {
            prev: prev || null,
            next: next || null
        }
    }

    async updateCommentCount (articleIds = []) {
        if (!Array.isArray(articleIds)) {
            articleIds = [articleIds]
        }
        if (!articleIds.length) return
        const { validate, share } = this.app.utils
        // TIP: 这里必须$in的是一个ObjectId对象数组，而不能只是id字符串数组
        articleIds = [...new Set(articleIds)].filter(id => validate.isObjectId(id)).map(id => share.createObjectId(id))
        const counts = await this.service.comment.aggregate([
            { $match: { article: { $in: articleIds } } },
            { $group: { _id: '$article', total_count: { $sum: 1 } } }
        ])
        await Promise.all(
            counts.map(count => this.updateItemById(count._id, { $set: { 'meta.comments': count.total_count } }))
        )
        this.logger.info('文章评论数量更新成功')
    }
}
