Rails.application.routes.draw do
  post "/graphql", to: "graphql#execute"
  get "/up", to: "status#show"
end
