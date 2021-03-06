/**
 * @desc 分类 Services
 */

const ProxyService = require('./proxy')

module.exports = class CategoryService extends ProxyService {
    get model () {
        return this.app.model.Category
    }

    async getList (query, select = null, opt) {
        opt = this.app.merge({
            sort: 'createdAt'
        }, opt)
        let categories = await this.model.find(query, select, opt).exec()
        if (categories.length) {
            const PUBLISH = this.app.config.modelEnum.article.state.optional.PUBLISH
            categories = await Promise.all(
                categories.map(async item => {
                    item = item.toObject()
                    const articles = await this.service.article.getList({
                        category: item._id,
                        state: PUBLISH
                    })
                    item.count = articles.length
                    return item
                })
            )
        }
        return categories
    }
}
