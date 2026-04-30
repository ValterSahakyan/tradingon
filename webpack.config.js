const path = require('node:path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const backendHost = '127.0.0.1'
const backendPort = Number(process.env.PORT || 3002)

module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production'

  return {
    mode: isProduction ? 'production' : 'development',
    entry: path.resolve(__dirname, 'src', 'main.tsx'),
    output: {
      path: path.resolve(__dirname, 'public'),
      filename: isProduction ? 'assets/[name].[contenthash].js' : 'assets/[name].js',
      publicPath: '/',
      clean: true,
    },
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'index.html'),
      }),
    ],
    devServer: {
      host: '0.0.0.0',
      port: 5173,
      historyApiFallback: true,
      hot: true,
      proxy: [
        {
          context: ['/api'],
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
          onError(_err, req, res) {
            if (res.headersSent) {
              return
            }

            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: 'Backend unavailable',
                path: req.url,
              }),
            )
          },
        },
      ],
    },
    performance: {
      hints: false,
    },
  }
}
